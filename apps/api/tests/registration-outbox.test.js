import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import knex from 'knex';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { registerWithVerificationOutbox } from '../src/registration-outbox.js';
import { createVerificationResendAdapter } from '../src/verification-outbox-adapter.js';

const makeDb = () => knex({
  client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true
});
const token = 'e'.repeat(64); // synthetic test token; never use in production
const sample = (email = 'Student@example.test') => ({
  account: {
    name: 'Synthetic Student', email, role: 'student',
    passwordHash: 'scrypt:synthetic-only'
  },
  validatedProfile: { bio: 'Synthetic profile' },
  token,
  expiresAt: Date.now() + 30 * 60_000,
  message: {
    subject: 'Synthetic verification',
    body: 'https://example.test/#/verify?token=' + token
  }
});

test('Approval Pending ST-106: create account, digest, profile and outbox together', async () => {
  const db = makeDb();
  try {
    await migrateMySQL(db);
    const user = await registerWithVerificationOutbox(db, sample());
    assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'name', 'role']);
    assert.equal(user.email, 'student@example.test');
    const digest = createHash('sha256').update(token).digest('hex');
    assert.equal((await db('users').count({ n: '*' }).first()).n, 1);
    assert.equal((await db('account_secrets').first()).password_hash, 'scrypt:synthetic-only');
    assert.equal((await db('account_profiles').first()).bio, 'Synthetic profile');
    const verification = await db('email_verifications').first();
    assert.equal(verification.token_hash, digest);
    assert.notEqual(verification.token_hash, token);
    const outbox = await db('email_outbox').first();
    assert.equal(outbox.status, 'pending');
    assert.equal(outbox.recipient, 'student@example.test');
    assert.equal(outbox.user_id, user.id);
  } finally { await db.destroy(); }
});

test('Approval Pending ST-106: duplicate email rolls back and emits structured conflict', async () => {
  const db = makeDb();
  try {
    await migrateMySQL(db);
    await registerWithVerificationOutbox(db, sample());
    await assert.rejects(registerWithVerificationOutbox(db,
      sample('STUDENT@EXAMPLE.TEST')), error => error.code === 'DUPLICATE_EMAIL');
    for (const table of ['users', 'account_secrets', 'account_profiles',
      'email_verifications', 'email_outbox']) {
      assert.equal((await db(table).count({ n: '*' }).first()).n, 1, table);
    }
  } finally { await db.destroy(); }
});

test('Approval Pending ST-106: downstream outbox failure rolls back account and token', async () => {
  const db = makeDb();
  try {
    await migrateMySQL(db);
    // Use a database trigger to force an outbox insert failure for SQLite.
    await db.raw(`CREATE TRIGGER stop_test_outbox BEFORE INSERT ON email_outbox
      BEGIN SELECT RAISE(FAIL, 'synthetic downstream failure'); END`);
    await assert.rejects(registerWithVerificationOutbox(db, sample()), /synthetic downstream failure/);
    for (const table of ['users', 'account_secrets', 'account_profiles',
      'email_verifications', 'email_outbox']) {
      assert.equal((await db(table).count({ n: '*' }).first()).n, 0, table);
    }
  } finally { await db.destroy(); }
});

test('Approval Pending ST-106: reject malformed token, past expiry and invalid role', async () => {
  const db = makeDb();
  try {
    await migrateMySQL(db);
    const s = sample();
    await assert.rejects(registerWithVerificationOutbox(db, { ...s, token: 'weak' }), /32 random bytes/);
    await assert.rejects(registerWithVerificationOutbox(db,
      { ...s, expiresAt: Date.now() - 1000 }), /Future verification expiry/);
    await assert.rejects(registerWithVerificationOutbox(db,
      { ...s, account: { ...s.account, role: 'admin' } }), /Invalid role/);
    assert.equal((await db('users').count({ n: '*' }).first()).n, 0);
  } finally { await db.destroy(); }
});

test('Approval Pending ST-106: initial registration and subsequent resend enforce the same cooldown', async () => {
  const db = makeDb();
  try {
    await migrateMySQL(db);
    const user = await registerWithVerificationOutbox(db, sample());
    const original = await db('email_verifications').where({ user_id: user.id }).first();
    const initialTime = new Date(original.created_at).getTime();
    assert.ok(Number.isFinite(initialTime));
    const cooldownMs = 60_000;
    let now = initialTime + 1000;
    let generated = 0;
    const resend = createVerificationResendAdapter(db, {
      now: () => now,
      tokenTtlMs: 30 * 60_000,
      cooldownMs,
      createToken: () => (++generated).toString(16).padStart(64, 'a'),
      renderVerificationEmail: ({ token }) => ({
        subject: 'Synthetic resend',
        body: 'https://example.test/#/verify?token=' + token
      })
    });
    const count = async table =>
      Number((await db(table).where({ user_id: user.id }).count({ n: '*' }).first()).n);

    // The original registration email starts the same server-side cooldown.
    await resend(user.email);
    assert.equal(generated, 0);
    assert.equal(await count('email_outbox'), 1);

    // After expiry, exactly one resend is queued.
    now = initialTime + cooldownMs + 1000;
    await resend(user.email);
    assert.equal(generated, 1);
    assert.equal(await count('email_verifications'), 2);
    assert.equal(await count('email_outbox'), 2);

    // A repeat must consult the resend timestamp, not the original timestamp.
    now += 1000;
    await resend(user.email);
    assert.equal(generated, 1);
    assert.equal(await count('email_verifications'), 2);
    assert.equal(await count('email_outbox'), 2);

    // Check that the cooldown really resets after the newest issuance.
    now += cooldownMs;
    await resend(user.email);
    assert.equal(generated, 2);
    assert.equal(await count('email_verifications'), 3);
    assert.equal(await count('email_outbox'), 3);
  } finally { await db.destroy(); }
});

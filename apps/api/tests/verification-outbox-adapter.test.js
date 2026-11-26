import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import knex from 'knex';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { createAccount, markEmailVerified } from '../src/account-store.js';
import { createVerificationResendAdapter } from '../src/verification-outbox-adapter.js';

const dbForTest = () => knex({
  client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true
});
const fixedNow = Date.parse('2026-11-27T08:00:00Z');
const rawToken = 'a'.repeat(64);
const makeAdapter = (db, options = {}) => createVerificationResendAdapter(db, {
  now: () => fixedNow,
  tokenTtlMs: 30 * 60 * 1000,
  cooldownMs: 60 * 1000,
  createToken: () => rawToken,
  renderVerificationEmail: ({ email, token }) => ({
    subject: 'Synthetic verification only',
    body: 'https://example.test/#/verify?token=' + token + '&email=' + email
  }),
  ...options
});

test('Approval Pending ST-106: eligible resend atomically persists digest and queued email', async () => {
  const db = dbForTest();
  try {
    await migrateMySQL(db);
    const account = await createAccount(db, {
      name: 'Student', email: 'Student@Example.test',
      role: 'student', passwordHash: 'synthetic-hash'
    });
    await makeAdapter(db)('student@example.test');
    const verification = await db('email_verifications').where({ user_id: account.id }).first();
    assert.equal(verification.token_hash, createHash('sha256').update(rawToken).digest('hex'));
    assert.notEqual(verification.token_hash, rawToken);
    assert.equal(new Date(verification.expires_at).getTime(), fixedNow + 30 * 60 * 1000);
    const message = await db('email_outbox').first();
    assert.equal(message.status, 'pending');
    assert.equal(message.recipient, 'student@example.test');
    assert.match(message.body, /verify\?token=/);
    assert.equal((await db('email_outbox').count({ n: '*' }).first()).n, 1);
  } finally { await db.destroy(); }
});

test('Approval Pending ST-106: cooldown, unknown and verified accounts remain generic, no new mail', async () => {
  const db = dbForTest();
  try {
    await migrateMySQL(db);
    const student = await createAccount(db, {
      name: 'Student', email: 'student@example.test',
      role: 'student', passwordHash: 'synthetic-hash'
    });
    const verified = await createAccount(db, {
      name: 'Verified', email: 'verified@example.test',
      role: 'student', passwordHash: 'synthetic-hash'
    });
    await markEmailVerified(db, verified.id);
    const adapter = makeAdapter(db);
    assert.equal(await adapter('unknown@example.test'), undefined);
    assert.equal(await adapter('verified@example.test'), undefined);
    await adapter('student@example.test');
    assert.equal(await adapter('student@example.test'), undefined);
    assert.equal((await db('email_verifications').where({ user_id: student.id }).count({ n: '*' }).first()).n, 1);
    assert.equal((await db('email_outbox').count({ n: '*' }).first()).n, 1);
  } finally { await db.destroy(); }
});

test('Approval Pending ST-106: failed verification email preparation rolls back token issuance', async () => {
  const db = dbForTest();
  try {
    await migrateMySQL(db);
    await createAccount(db, {
      name: 'Student', email: 'student@example.test',
      role: 'student', passwordHash: 'synthetic-hash'
    });
    const adapter = makeAdapter(db, {
      renderVerificationEmail: () => { throw new Error('Synthetic builder failure'); }
    });
    await assert.rejects(adapter('student@example.test'), /Synthetic builder failure/);
    assert.equal((await db('email_verifications').count({ n: '*' }).first()).n, 0);
    assert.equal((await db('email_outbox').count({ n: '*' }).first()).n, 0);
  } finally { await db.destroy(); }
});

test('Approval Pending ST-106: rejects missing policy and weak tokens before database writes', async () => {
  const db = dbForTest();
  try {
    await migrateMySQL(db);
    assert.throws(() => createVerificationResendAdapter(db), /Approved token/);
    assert.throws(() => makeAdapter(db, { cooldownMs: 0 }), /cooldown/);
    await createAccount(db, {
      name: 'Student', email: 'student@example.test',
      role: 'student', passwordHash: 'synthetic-hash'
    });
    await assert.rejects(makeAdapter(db, {
      createToken: () => 'weak'
    })('student@example.test'), /32 random bytes/);
    assert.equal((await db('email_outbox').count({ n: '*' }).first()).n, 0);
  } finally { await db.destroy(); }
});

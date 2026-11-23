import test from 'node:test';
import assert from 'node:assert/strict';
import knex from 'knex';
import { migrateMySQL } from '../src/mysql-migrations.js';
import {
  createAccount, findAccountByEmail, findAccountCredentials, updateAccountProfile,
  storeEmailVerification, storeAuthToken, createSession, enqueueEmail,
  getPendingEmails, markEmailSent, setAccountApproval, markEmailVerified,
  createOtpChallenge, recordEmailDeliveryAttempt
} from '../src/account-store.js';

function dbForTest() {
  return knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
}

test('account creation persists profile and hashed password; duplicate emails are rejected', async () => {
  const db = dbForTest();
  try {
    await migrateMySQL(db);
    const account = await createAccount(db, {
      name: 'Sample Student', email: 'Student@Example.Test', role: 'student',
      passwordHash: 'argon2id$synthetic-test-hash', bio: 'Study maths'
    });
    assert.equal(account.email, 'student@example.test');
    assert.equal((await findAccountByEmail(db, 'STUDENT@EXAMPLE.TEST')).bio, 'Study maths');
    const credentials = await findAccountCredentials(db, 'student@example.test');
    assert.equal(credentials.password_hash, 'argon2id$synthetic-test-hash');
    assert.equal((await findAccountByEmail(db, 'student@example.test')).password_hash, undefined);
    await assert.rejects(createAccount(db, {
      name: 'Duplicate', email: 'student@example.test', role: 'student', passwordHash: 'otherhash'
    }));
    assert.equal((await db('users').count({ n: '*' }).first()).n, 1);
    assert.equal(await updateAccountProfile(db, account.id, { bio: 'Learning Node' }), true);
    assert.equal((await findAccountByEmail(db, 'student@example.test')).bio, 'Learning Node');
  } finally {
    await db.destroy();
  }
});

test('failed account creation rolls back all inserts', async () => {
  const db = dbForTest();
  try {
    await migrateMySQL(db);
    await db('account_profiles').insert({ user_id: 99, bio: 'placeholder' }).catch(() => {});
    await assert.rejects(createAccount(db, {
      name: 'Bad', email: 'invalid@example.test', role: 'admin', passwordHash: 'hash'
    }), /Invalid account role/);
    assert.equal((await db('users').count({ n: '*' }).first()).n, 0);
    assert.equal((await db('account_profiles').count({ n: '*' }).first()).n, 0);
  } finally { await db.destroy(); }
});

test('verification, sessions, hashed tokens and email outbox store synthetic records', async () => {
  const db = dbForTest();
  try {
    await migrateMySQL(db);
    const account = await createAccount(db, {
      name: 'Sample Tutor', email: 'tutor@example.test', role: 'tutor', passwordHash: 'argon2id$synthetic'
    });
    const expiry = new Date(Date.now() + 60_000);
    await storeEmailVerification(db, { userId: account.id, token: 'synthetic-verify-token', expiresAt: expiry });
    await storeAuthToken(db, { userId: account.id, purpose: 'reset', token: 'synthetic-reset-token', expiresAt: expiry });
    await createSession(db, { id: 'synthetic-session', userId: account.id, expiresAt: expiry });
    const verification = await db('email_verifications').first();
    assert.notEqual(verification.token_hash, 'synthetic-verify-token');
    assert.equal(verification.token_hash.length, 64);
    assert.equal((await db('sessions').first()).user_id, account.id);
    assert.equal((await db('auth_tokens').first()).purpose, 'reset');
    const id = await enqueueEmail(db, {
      userId: account.id, recipient: 'Tutor@Example.Test', subject: 'Verify email', body: 'Synthetic only'
    });
    const pending = await getPendingEmails(db);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].recipient, 'tutor@example.test');
    assert.equal(pending[0].id, id);
    assert.equal(await markEmailSent(db, id), 1);
    assert.equal((await getPendingEmails(db)).length, 0);
  } finally { await db.destroy(); }
});


test('approval, verification, OTP and email attempt audit are independent', async () => {
  const db = dbForTest();
  try {
    await migrateMySQL(db);
    const account = await createAccount(db, {
      name: 'Pending Student', email: 'pending@example.test', role: 'student',
      passwordHash: 'argon2id$synthetic'
    });
    let row = await db('users').where({ id: account.id }).first();
    assert.equal(row.role, 'student');
    assert.equal(row.approval_status, 'pending');
    assert.equal(row.email_verified_at, null);
    assert.equal(await setAccountApproval(db, account.id, 'approved'), true);
    assert.equal(await markEmailVerified(db, account.id), true);
    assert.equal(await markEmailVerified(db, account.id), false);
    row = await db('users').where({ id: account.id }).first();
    assert.equal(row.role, 'student');
    assert.equal(row.approval_status, 'approved');
    assert.ok(row.email_verified_at);
    await assert.rejects(setAccountApproval(db, account.id, 'verified'));
    await createOtpChallenge(db, {
      userId: account.id, purpose: 'login', code: 'synthetic-otp-secret',
      expiresAt: new Date(Date.now() + 300000)
    });
    const otp = await db('otp_challenges').first();
    assert.equal(otp.challenge_hash.length, 64);
    assert.notEqual(otp.challenge_hash, 'synthetic-otp-secret');
    const outboxId = await enqueueEmail(db, {
      userId: account.id, recipient: 'pending@example.test',
      subject: 'Synthetic', body: 'A test body'
    });
    assert.equal(await recordEmailDeliveryAttempt(db, {
      outboxId, delivered: false, errorSummary: 'Temporary test failure'
    }), true);
    assert.equal(await recordEmailDeliveryAttempt(db, {
      outboxId, delivered: true, providerMessageId: 'test-id'
    }), true);
    assert.equal(await recordEmailDeliveryAttempt(db, { outboxId, delivered: true }), false);
    const attempts = await db('email_delivery_attempts').orderBy('id');
    assert.deepEqual(attempts.map((attempt) => attempt.outcome), ['failed', 'sent']);
    const mail = await db('email_outbox').where({ id: outboxId }).first();
    assert.equal(mail.status, 'sent');
    assert.equal(mail.attempts, 2);
  } finally {
    await db.destroy();
  }
});

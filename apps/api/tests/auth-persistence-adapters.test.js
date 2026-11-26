import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import knex from 'knex';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { createAuthPersistenceAdapters } from '../src/auth-persistence-adapters.js';
import { setAccountApproval } from '../src/account-store.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
function database() {
  return knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
}

test('Jahid registration contract: case-insensitive email, safe response and duplicate code', async () => {
  const db = database();
  try {
    await migrateMySQL(db);
    const adapters = createAuthPersistenceAdapters(db, {
      verifyPassword: async (password, hash) => password === 'test-password' && hash === 'test-hash'
    });
    const user = await adapters.registerAccount({
      name: 'Integration Student', email: 'STUDENT@EXAMPLE.TEST',
      role: 'student', passwordHash: 'test-hash'
    }, { bio: 'Student profile' });
    assert.equal(user.email, 'student@example.test');
    assert.equal(user.passwordHash, undefined);
    assert.equal((await db('account_profiles').where({ user_id: user.id }).first()).bio, 'Student profile');
    await assert.rejects(adapters.registerAccount({
      name: 'Other', email: 'student@example.test', role: 'tutor', passwordHash: 'other'
    }), (error) => error.code === 'DUPLICATE_EMAIL');
    assert.equal((await db('account_secrets').count({ n: '*' }).first()).n, 1);
  } finally { await db.destroy(); }
});

test('Jahid verification and sessions: unverified login denied; token single use, expiry, revoke', async () => {
  const db = database();
  try {
    await migrateMySQL(db);
    const adapters = createAuthPersistenceAdapters(db, {
      verifyPassword: async (password, hash) => password === 'test-password' && hash === 'test-hash'
    });
    const user = await adapters.registerAccount({
      name: 'Student', email: 'student@example.test', role: 'student', passwordHash: 'test-hash'
    }, {});
    const sessionHash = digest('synthetic-session-token');
    assert.equal(await adapters.authenticatePassword(user.email, 'test-password'), null);
    assert.equal(await adapters.persistSession({
      accountId: user.id, tokenHash: sessionHash, expiresAt: Date.now() + 60000
    }), false);

    await setAccountApproval(db, user.id, 'approved');
    const expired = digest('synthetic-expired-verification');
    const valid = digest('synthetic-valid-verification');
    await db('email_verifications').insert([
      { user_id: user.id, token_hash: expired, expires_at: new Date(Date.now() - 30000) },
      { user_id: user.id, token_hash: valid, expires_at: new Date(Date.now() + 60000) }
    ]);
    assert.equal(await adapters.consumeVerificationToken(expired), false);
    assert.equal(await adapters.consumeVerificationToken(valid), true);
    assert.equal(await adapters.consumeVerificationToken(valid), false);
    assert.equal(await adapters.authenticatePassword(user.email, 'wrong'), null);
    const account = await adapters.authenticatePassword('STUDENT@EXAMPLE.TEST', 'test-password');
    assert.equal(account.verified, true);
    assert.equal(account.password_hash, undefined);
    assert.equal(await adapters.persistSession({
      accountId: user.id, tokenHash: sessionHash, expiresAt: Date.now() + 60000
    }), true);
    const session = await adapters.lookupSession(sessionHash);
    assert.equal(session.account.email, user.email);
    assert.equal(session.revokedAt, null);
    assert.ok(session.expiresAt > Date.now());
    assert.equal(await adapters.revokeSession(sessionHash), true);
    assert.equal(await adapters.revokeSession(sessionHash), false);
    assert.ok((await adapters.lookupSession(sessionHash)).revokedAt != null);
  } finally { await db.destroy(); }
});

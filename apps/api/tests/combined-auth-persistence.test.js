import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import knex from 'knex';
import { createApp } from '../src/app.js';
import { createAuthPersistenceAdapters } from '../src/auth-persistence-adapters.js';
import { createDatabaseConnection } from '../src/database-connection.js';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { setAccountApproval } from '../src/account-store.js';
import { verifyPassword } from '../src/auth/password.js';
import { createVerificationToken } from '../src/auth/verification-token.js';
import { hashSessionToken } from '../src/auth/session-token.js';

async function exercisePersistence(t, db) {
  let server;
  t.after(async () => {
    try {
      if (server?.listening) {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    } finally {
      await db.destroy();
    }
  });
  await migrateMySQL(db);
  const adapters = createAuthPersistenceAdapters(db, { verifyPassword });
  server = createApp(db, {
    ...adapters,
    // A test-only validator. Required profile/consent fields still need agreement.
    validateProfileAndConsent: () => ({ valid: true, profile: { bio: 'Fixture profile' } })
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + '/api/auth' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { status: 'ok', database: 'connected' });
  for (const role of ['student', 'tutor']) {
    const email = `${role}@example.test`;
    const password = 'FixtureOnlyPassword123';
    const input = { name: `Fixture ${role}`, role, email: email.toUpperCase(), password };
    const registration = await post('/register', input);
    assert.equal(registration.status, 201);
    const { account } = await registration.json();
    const publicAccount = { id: account.id, name: input.name, email, role };
    assert.deepEqual(account, { ...publicAccount, verified: false });
    const secret = await db('account_secrets').where({ user_id: account.id }).first();
    assert.equal(await verifyPassword(password, secret.password_hash), true);
    assert.notEqual(secret.password_hash, password);
    assert.equal((await db('account_profiles').where({ user_id: account.id }).first()).bio, 'Fixture profile');
    assert.equal((await post('/register', { ...input, email })).status, 409);
    assert.equal((await post('/login', { email, password })).status, 401);
    assert.equal((await post('/resend-verification', { email })).status, 503);

    // A seeded challenge isolates consumption from the still-open token/outbox handoff.
    const { token, tokenHash, expiresAt } = createVerificationToken();
    await db('email_verifications').insert({ user_id: account.id, token_hash: tokenHash, expires_at: new Date(expiresAt) });
    assert.equal((await post('/verify-email', { token })).status, 200);
    assert.equal((await post('/verify-email', { token })).status, 400);
    assert.equal((await post('/login', { email, password })).status, 401);
    assert.equal(await setAccountApproval(db, account.id, 'approved'), true);
    assert.equal((await post('/login', { email, password: 'wrong-password' })).status, 401);

    const login = await post('/login', { email, password });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { account: publicAccount });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const digest = hashSessionToken(cookie.split('=')[1]);
    const stored = await db('sessions').where({ id: digest }).first();
    assert.equal(stored.user_id, account.id);
    const me = () => fetch(base + '/api/auth/me', { headers: { cookie } });
    assert.deepEqual(await (await me()).json(), { account: publicAccount });
    assert.equal((await post('/logout', {}, { cookie })).status, 204);
    assert.ok((await db('sessions').where({ id: digest }).first()).revoked_at);
    assert.equal((await me()).status, 401);
  }
}

test('combined auth HTTP lifecycle using the proposed SQLite schema', async (t) => {
  const db = knex({
    client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true
  });
  await exercisePersistence(t, db);
});

test('combined auth HTTP lifecycle using disposable MySQL 8.4', {
  skip: process.env.TEST_MYSQL !== '1'
}, async (t) => {
  const { DB_CLIENT, DB_HOST, DB_NAME } = process.env;
  if (DB_CLIENT !== 'mysql2' || DB_HOST !== '127.0.0.1' || DB_NAME !== 'smarttutor_test') {
    throw new Error('The combined MySQL test requires a disposable loopback smarttutor_test database');
  }
  await exercisePersistence(t, createDatabaseConnection());
});

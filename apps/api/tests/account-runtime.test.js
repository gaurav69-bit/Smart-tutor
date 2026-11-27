import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import knex from 'knex';
import { createAccountRuntime } from '../src/account-runtime.js';
import { createApp } from '../src/app.js';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { createDatabaseConnection } from '../src/database-connection.js';
import { createVerificationToken } from '../src/auth/verification-token.js';
import { setAccountApproval } from '../src/account-store.js';

async function exerciseRuntime(t, db) {
  await migrateMySQL(db);
  const messages = [];
  const env = { APP_URL: 'https://smarttutor.example.test' };
  const runtime = createAccountRuntime(db, env, { send: async message => {
    messages.push(message); return { messageId: 'synthetic-receipt' };
  } });
  const server = createApp(db, runtime).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.destroy(); });
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const post = (path, body, headers = {}) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
  });
  for (const [i, role] of ['student', 'tutor'].entries()) {
    const payload = { name: 'Synthetic ' + role, email: `runtime-${role}@example.test`, role,
      password: 'SyntheticPassword123!', username: `runtime_${role}`, subject: 'Maths', terms: true,
      ...(role === 'student' ? { dob: '2000-01-01', address: 'Synthetic test address' }
        : { bio: 'Synthetic tutor', qualifications: 'Synthetic qualification' }) };
    const registered = await post('/register', payload);
    assert.equal(registered.status, 201, await registered.clone().text());
    assert.equal(registered.headers.get('cache-control'), 'no-store');
    const { account } = await registered.json();
    const details = await db('account_registration_details').where({ user_id: account.id }).first();
    assert.equal(details.username, payload.username);
    assert.equal(details.subject, 'Maths');
    assert.equal(details.terms_version, 'smarttutor-terms-v1');
    assert.ok(details.terms_accepted_at);
    assert.equal(details.address, role === 'student' ? payload.address : null);
    assert.equal(details.qualifications, role === 'tutor' ? payload.qualifications : null);
    assert.equal(messages.length, i * 2 + 1);
    const token = messages.at(-1).textContent.match(/token=([a-f0-9]{64})/)[1];
    assert.equal((await post('/verify-email', { token })).status, 200);
    assert.equal(messages.length, (i + 1) * 2);
    assert.equal(messages.at(-1).to, payload.email);
    assert.equal(messages.at(-1).subject, 'Welcome to Smart Tutor');
    const welcome = await db('email_outbox')
      .where({ user_id: account.id, subject: 'Welcome to Smart Tutor' }).first();
    assert.equal(welcome.status, 'sent');
    assert.equal((await post('/verify-email', { token })).status, 400);
    const second = createVerificationToken();
    await db('email_verifications').insert({
      user_id: account.id, token_hash: second.tokenHash, expires_at: new Date(second.expiresAt)
    });
    assert.equal((await post('/verify-email', { token: second.token })).status, 200);
    assert.equal(messages.length, (i + 1) * 2);
    assert.equal((await post('/login', payload)).status, 401);
    // Approval is an explicit action for a synthetic test account, never auto-approval.
    await setAccountApproval(db, account.id, 'approved');
    const login = await post('/login', payload);
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));
    const me = () => fetch(base + '/me', { headers: { cookie } });
    assert.equal((await me()).status, 200);
    assert.equal((await post('/logout', {}, { cookie })).status, 204);
    assert.equal((await me()).status, 401);
    const duplicate = await post('/register', { ...payload, email: `other-${role}@example.test` });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error.code, 'DUPLICATE_USERNAME');
    assert.equal(messages.length, (i + 1) * 2);
  }
  assert.equal((await post('/login', {}, { origin: 'https://untrusted.example.test' })).status, 403);
  assert.equal((await post('/login', {}, { origin: env.APP_URL })).status, 400);
  assert.equal(await runtime.checkRateLimit('synthetic', 'one', 1), true);
  assert.equal(await runtime.checkRateLimit('synthetic', 'one', 1), false);
  assert.equal(await runtime.checkRateLimit('synthetic', 'two', 1), true);
}

test('production account composition persists profiles, sends initial mail and enforces manual approval', async t => {
  await exerciseRuntime(t, knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true }));
});

test('production composition on disposable MySQL', { skip: process.env.TEST_MYSQL !== '1' }, async t => {
  if (process.env.DB_NAME !== 'smarttutor_test' || process.env.DB_HOST !== '127.0.0.1') {
    throw new Error('Disposable local test database required');
  }
  await exerciseRuntime(t, createDatabaseConnection());
});

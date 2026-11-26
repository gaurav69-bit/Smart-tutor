import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';
import { hashSessionToken } from '../src/auth/session-token.js';

const password = 'TestOnlyStrongPassword123';
const credentials = { email: 'STUDENT@EXAMPLE.TEST', password };
const account = { id: 9, name: 'Example Student', email: 'student@example.test',
  role: 'student', verified: true, passwordHash: 'must-not-leak' };

async function setup(t, adapters = {}) {
  const db = openDatabase(':memory:');
  migrate(db);
  const server = createApp(db, adapters).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}
const post = (base, path, body, headers = {}) => fetch(base + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body)
});

test('ST-71: login rejects invalid inputs without invoking password adapter', async (t) => {
  let called = 0;
  const base = await setup(t, { authenticatePassword: async () => { called++; return account; },
    persistSession: async () => true });
  for (const body of [{}, null, [], { email: 'bad', password }, { email: 'student@example.test', password: '' }]) {
    const response = await post(base, '/api/auth/login', body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal(called, 0);
});

test('ST-71: no real password/session adapters means login unavailable', async (t) => {
  const base = await setup(t);
  const response = await post(base, '/api/auth/login', credentials);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'LOGIN_UNAVAILABLE');
  assert.equal(response.headers.get('set-cookie'), null);
});

test('ST-71: unverified, unknown and admin accounts never receive session cookies', async (t) => {
  for (const candidate of [null, { ...account, verified: false }, { ...account, role: 'admin' }]) {
    let sessions = 0;
    const base = await setup(t, {
      authenticatePassword: async () => candidate,
      persistSession: async () => { sessions++; return true; }
    });
    const response = await post(base, '/api/auth/login', credentials);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'INVALID_CREDENTIALS');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(sessions, 0);
  }
});

test('ST-71: login stores only digest and sets HttpOnly cookie after persisted session', async (t) => {
  let saved;
  let checkedEmail;
  const base = await setup(t, {
    authenticatePassword: async (email, pwd) => {
      checkedEmail = email;
      assert.equal(pwd, password);
      return account;
    },
    persistSession: async (record) => { saved = record; return true; }
  });
  const response = await post(base, '/api/auth/login', credentials);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { account: { id: 9, name: 'Example Student',
    email: 'student@example.test', role: 'student' } });
  assert.equal(checkedEmail, 'student@example.test');
  assert.equal(saved.accountId, 9);
  assert.match(saved.tokenHash, /^[a-f0-9]{64}$/);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^st_session=[a-f0-9]{64};/);
  assert.match(cookie, /httponly/i);
  assert.match(cookie, /samesite=lax/i);
  assert.equal(saved.tokenHash, hashSessionToken(cookie.split(';')[0].split('=')[1]));
  assert.equal(JSON.stringify(body).includes(password), false);
  assert.equal(JSON.stringify(body).includes(account.passwordHash), false);
});

test('ST-71: persistence refusal cannot issue cookie or report login success', async (t) => {
  const base = await setup(t, {
    authenticatePassword: async () => account,
    persistSession: async () => false
  });
  const response = await post(base, '/api/auth/login', credentials);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('ST-71: logout passes only digest for revocation and clears cookie', async (t) => {
  let revoked;
  const base = await setup(t, { revokeSession: async (hash) => { revoked = hash; return true; } });
  const token = 'a'.repeat(64);
  const response = await post(base, '/api/auth/logout', {}, { cookie: `st_session=${token}` });
  assert.equal(response.status, 204);
  assert.equal(revoked, hashSessionToken(token));
  assert.match(response.headers.get('set-cookie'), /st_session=;/);
});

test('ST-71: logout with session but no revoke adapter fails closed', async (t) => {
  const base = await setup(t);
  const response = await post(base, '/api/auth/logout', {}, { cookie: `st_session=${'b'.repeat(64)}` });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'LOGOUT_UNAVAILABLE');
});

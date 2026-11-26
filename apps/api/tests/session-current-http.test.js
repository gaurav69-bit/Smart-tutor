import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';
import { hashSessionToken } from '../src/auth/session-token.js';

const token = 'c'.repeat(64);
const account = { id: 12, name: 'Example Student', email: 'student@example.test',
  role: 'student', verified: true, passwordHash: 'never-expose' };

async function setup(t, lookupSession) {
  const db = openDatabase(':memory:');
  migrate(db);
  const server = createApp(db, { lookupSession }).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  return `http://127.0.0.1:${server.address().port}/api/auth/me`;
}
const get = (url, cookie) => fetch(url, {
  headers: cookie ? { cookie } : {}
});

test('ST-71: protected account endpoint rejects missing and invalid cookies', async (t) => {
  let lookups = 0;
  const url = await setup(t, async () => { lookups++; return { account }; });
  for (const cookie of [null, 'st_session=invalid', 'other=value']) {
    const response = await get(url, cookie);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
  }
  assert.equal(lookups, 0);
});

test('ST-71: protected account endpoint fails closed without persistence', async (t) => {
  const url = await setup(t);
  const response = await get(url, `st_session=${token}`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'SESSION_UNAVAILABLE');
});

test('ST-71: expired, revoked, unverified and missing sessions cannot access account', async (t) => {
  const now = Date.now();
  for (const session of [
    null,
    { expiresAt: now - 1000, revokedAt: null, account },
    { expiresAt: now + 60000, revokedAt: now, account },
    { expiresAt: now + 60000, revokedAt: null, account: { ...account, verified: false } },
    { expiresAt: now + 60000, revokedAt: null, account: { ...account, role: 'admin' } }
  ]) {
    const url = await setup(t, async () => session);
    const response = await get(url, `st_session=${token}`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
  }
});

test('ST-71: protected account lookup receives digest and returns safe account fields', async (t) => {
  let received;
  const url = await setup(t, async (hash) => {
    received = hash;
    return { expiresAt: Date.now() + 60000, revokedAt: null, account };
  });
  const response = await get(url, `st_session=${token}`);
  assert.equal(response.status, 200);
  assert.equal(received, hashSessionToken(token));
  const body = await response.json();
  assert.deepEqual(body, { account: { id: 12, name: 'Example Student',
    email: 'student@example.test', role: 'student' } });
  assert.equal(JSON.stringify(body).includes(token), false);
  assert.equal(JSON.stringify(body).includes(account.passwordHash), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';
import { createVerificationToken } from '../src/auth/verification-token.js';

async function setup(t, consumeVerificationToken) {
  const db = openDatabase(':memory:');
  migrate(db);
  const server = createApp(db, { consumeVerificationToken }).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  return `http://127.0.0.1:${server.address().port}/api/auth/verify-email`;
}
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

test('ST-70: verification rejects malformed tokens without touching persistence', async (t) => {
  let calls = 0;
  const url = await setup(t, async () => { calls++; return true; });
  for (const body of [null, {}, [], { token: 'bad' }, { token: 5 }]) {
    const response = await post(url, body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  }
  assert.equal(calls, 0);
});

test('ST-70: without storage adapter verification returns 503, not fake success', async (t) => {
  const url = await setup(t);
  const { token } = createVerificationToken();
  const response = await post(url, { token });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'VERIFICATION_UNAVAILABLE');
});

test('ST-70: verification sends only digest to atomic persistence adapter', async (t) => {
  let received;
  const url = await setup(t, async (hash) => {
    received = hash;
    return true;
  });
  const { token, tokenHash } = createVerificationToken();
  const response = await post(url, { token });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { verified: true });
  assert.equal(received, tokenHash);
  assert.notEqual(received, token);
});

test('ST-70: consumed or expired token returns generic error', async (t) => {
  const url = await setup(t, async () => false);
  const { token } = createVerificationToken();
  const response = await post(url, { token });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'INVALID_OR_EXPIRED_TOKEN');
  assert.equal(JSON.stringify(body).includes(token), false);
});

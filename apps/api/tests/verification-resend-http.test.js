import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';

async function setup(t, queueVerificationResend) {
  const db = openDatabase(':memory:');
  migrate(db);
  const server = createApp(db, { queueVerificationResend }).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  return `http://127.0.0.1:${server.address().port}/api/auth/resend-verification`;
}
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

test('ST-70: resend rejects invalid input without calling outbox', async (t) => {
  let calls = 0;
  const url = await setup(t, async () => { calls++; });
  for (const body of [null, {}, [], { email: 123 }, { email: 'bad' },
    { email: 'x'.repeat(201) + '@example.test' }]) {
    const response = await post(url, body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  }
  assert.equal(calls, 0);
});

test('ST-70: resend without durable outbox adapter fails closed', async (t) => {
  const url = await setup(t);
  const response = await post(url, { email: 'student@example.test' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'VERIFICATION_UNAVAILABLE');
});

test('ST-70: resend normalizes email and returns generic accepted response', async (t) => {
  const received = [];
  const url = await setup(t, async (email) => { received.push(email); return true; });
  const response = await post(url, { email: 'STUDENT@EXAMPLE.TEST' });
  assert.equal(response.status, 202);
  assert.deepEqual(received, ['student@example.test']);
  const raw = await response.text();
  assert.equal(raw.includes('STUDENT@EXAMPLE.TEST'), false);
  assert.equal(JSON.parse(raw).message, 'If the account is eligible, a verification email will be sent');
});

test('ST-70: resend does not reveal whether an account exists or is eligible', async (t) => {
  const url = await setup(t, async () => false);
  const response = await post(url, { email: 'unknown@example.test' });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    message: 'If the account is eligible, a verification email will be sent'
  });
});

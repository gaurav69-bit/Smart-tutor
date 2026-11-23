import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { migrate, openDatabase } from '../src/db.js';

async function withServer(t, registerAccount, validateProfileAndConsent) {
  const db = openDatabase(':memory:');
  migrate(db);
  const server = createApp(db, { registerAccount, validateProfileAndConsent }).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/api/auth/register`,
    db
  };
}

const valid = {
  name: 'Example Student',
  email: 'STUDENT@example.test',
  password: 'NotARealPassword123',
  role: 'student'
};

async function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('ST-69: real route rejects invalid registration and never persists', async (t) => {
  let calls = 0;
  const { url } = await withServer(t, async () => { calls++; });
  const response = await post(url, { ...valid, role: 'admin' });
  assert.equal(response.status, 400);
  const text = await response.text();
  assert.equal(text.includes(valid.password), false);
  assert.equal(JSON.parse(text).error.code, 'VALIDATION_ERROR');
  assert.equal(calls, 0);
});

test('ST-69: valid registration stays unavailable without persistence adapter', async (t) => {
  const { url, db } = await withServer(t);
  const response = await post(url, valid);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: { code: 'REGISTRATION_UNAVAILABLE', message: 'Registration is not yet available' }
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
});

test('ST-69: injected persistence returns only safe account details', async (t) => {
  let received;
  const { url } = await withServer(t, async (account) => {
    received = account;
    return { id: 7, name: account.name, email: account.email, role: account.role };
  }, () => ({ valid: true }));
  const response = await post(url, valid);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    account: { id: 7, name: valid.name, email: 'student@example.test', role: 'student', verified: false }
  });
  assert.equal(received.email, 'student@example.test');
  assert.equal(Object.hasOwn(received, 'password'), false);
  assert.equal(received.passwordHash.startsWith('scrypt:'), true);
  assert.equal(JSON.stringify(await Promise.resolve(received)).includes(valid.password), false);
});

test('ST-69: duplicate email returns safe conflict status', async (t) => {
  const { url } = await withServer(t, async () => {
    const error = new Error('duplicate');
    error.code = 'DUPLICATE_EMAIL';
    throw error;
  }, () => ({ valid: true }));
  const response = await post(url, valid);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: { code: 'DUPLICATE_EMAIL', message: 'Email already registered' }
  });
});


test('ST-69: registration remains unavailable if profile/consent contract is not configured', async (t) => {
  let calls = 0;
  const { url } = await withServer(t, async () => { calls++; });
  const response = await post(url, valid);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'REGISTRATION_UNAVAILABLE');
  assert.equal(calls, 0, 'Account must not be persisted without required profile validation');
});

test('ST-69: missing consent blocks persistence through the injected contract', async (t) => {
  let calls = 0;
  const { url } = await withServer(t, async () => { calls++; }, (body) => {
    if (body.acceptedTerms !== true) {
      return { valid: false, errors: { acceptedTerms: 'Consent required' } };
    }
    return { valid: true };
  });
  const response = await post(url, valid);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { acceptedTerms: 'Consent required' } }
  });
  assert.equal(calls, 0);
});

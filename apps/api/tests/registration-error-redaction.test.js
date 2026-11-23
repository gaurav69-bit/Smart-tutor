import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';

test('ST-69: unexpected persistence errors never log submitted passwords', async (t) => {
  const secret = 'SensitiveTestOnlyPassword123';
  const db = openDatabase(':memory:');
  migrate(db);
  const server = createApp(db, {
    validateProfileAndConsent: () => ({ valid: true, profile: { acceptedTerms: true } }),
    registerAccount: async () => {
      throw new Error(`Unsafe adapter exception with password ${secret}`);
    }
  }).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Example Student', email: 'student@example.test',
        role: 'student', password: secret
      })
    });
    assert.equal(response.status, 500);
    const raw = await response.text();
    assert.equal(JSON.parse(raw).error.code, 'INTERNAL_ERROR');
    assert.equal(raw.includes(secret), false);
    assert.ok(logged.length > 0);
    assert.equal(logged.join(' ').includes(secret), false);
    assert.equal(logged.join(' ').includes('Unsafe adapter exception'), false);
  } finally {
    console.error = original;
  }
});

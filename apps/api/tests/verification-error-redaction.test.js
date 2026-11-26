import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';
import { createVerificationToken } from '../src/auth/verification-token.js';

test('ST-70: unexpected verification adapter errors cannot log raw tokens', async (t) => {
  const { token } = createVerificationToken();
  const db = openDatabase(':memory:');
  migrate(db);
  const server = createApp(db, {
    consumeVerificationToken: async () => {
      throw new Error(`Unsafe adapter exception with raw token ${token}`);
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
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token })
    });
    assert.equal(response.status, 500);
    const raw = await response.text();
    assert.equal(JSON.parse(raw).error.code, 'INTERNAL_ERROR');
    assert.equal(raw.includes(token), false);
    assert.ok(logged.length > 0);
    assert.equal(logged.join(' ').includes(token), false);
    assert.equal(logged.join(' ').includes('Unsafe adapter exception'), false);
  } finally {
    console.error = original;
  }
});

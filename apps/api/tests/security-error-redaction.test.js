import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';

test('ST-72: unexpected auth errors never leak credentials in HTTP or logs', async (t) => {
  const secret = 'SensitiveTestOnlyPassword123';
  const db = openDatabase(':memory:');
  migrate(db);
  const app = createApp(db, {
    authenticatePassword: async () => {
      // Simulate an unsafe third-party adapter error that includes a credential.
      throw new Error(`Database failure involving submitted password ${secret}`);
    },
    persistSession: async () => true
  });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });

  const originalError = console.error;
  const logged = [];
  console.error = (...parts) => { logged.push(parts.map(String).join(' ')); };
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'student@example.test', password: secret })
    });
    assert.equal(response.status, 500);
    const raw = await response.text();
    assert.equal(JSON.parse(raw).error.code, 'INTERNAL_ERROR');
    assert.equal(raw.includes(secret), false);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.ok(logged.length >= 1, 'Expected a safe operational error marker');
    assert.equal(logged.join(' ').includes(secret), false);
    assert.equal(logged.join(' ').includes('Database failure'), false);
  } finally {
    console.error = originalError;
  }
});

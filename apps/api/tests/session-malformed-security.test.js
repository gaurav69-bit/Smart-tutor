import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';

test('ST-72: malformed and oversized login requests never reach account storage', async (t) => {
  const db = openDatabase(':memory:');
  migrate(db);
  let authenticationCalls = 0;
  let sessionWrites = 0;
  const server = createApp(db, {
    authenticatePassword: async () => {
      authenticationCalls++;
      return { id: 1, role: 'student', verified: true };
    },
    persistSession: async () => { sessionWrites++; return true; }
  }).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
  const request = (body) => fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body
  });

  const malformed = await request('{"email":');
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    error: { code: 'INVALID_JSON', message: 'Invalid JSON body' }
  });
  assert.equal(malformed.headers.get('set-cookie'), null);

  const oversizedSecret = 'OversizedTestOnlyPassword'.repeat(1000);
  const oversized = await request(JSON.stringify({
    email: 'student@example.test', password: oversizedSecret
  }));
  assert.equal(oversized.status, 413);
  const raw = await oversized.text();
  assert.deepEqual(JSON.parse(raw), {
    error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' }
  });
  assert.equal(raw.includes(oversizedSecret), false);
  assert.equal(oversized.headers.get('set-cookie'), null);
  assert.equal(authenticationCalls, 0);
  assert.equal(sessionWrites, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
});

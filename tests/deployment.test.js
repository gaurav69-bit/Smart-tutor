import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import handler from '../api/index.js';

test('Vercel adapter supports direct and rewritten shared API routes', async (t) => {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const route of ['/api/health', '/api/index?__route=health']) {
    const result = await fetch(base + route);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { status: 'ok', database: 'connected' });
  }
  const result = await fetch(base + '/api/index?__route=sample/register-validation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Demo', email: 'demo@example.test', password: 'demo-only-password', role: 'student' })
  });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).valid, true);
  const invalid = await fetch(base + '/api/index?__route=sample/login-validation', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
});

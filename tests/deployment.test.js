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

// Isolated imports prevent a warm process from reusing another environment's pool.
import { spawnSync } from 'node:child_process';

test('hosted adapter rejects missing secrets and SQLite or disabled TLS in production', () => {
  const cases = [
    [{ DB_CLIENT: 'sqlite3' }, 'Production requires MySQL with verified TLS'],
    [{ DB_CLIENT: 'mysql2', DB_SSL: 'false' }, 'Production requires MySQL with verified TLS'],
    [{ DB_CLIENT: 'mysql2', DB_SSL: 'true', DB_PASSWORD: '' }, 'Missing database configuration: DB_PASSWORD']
  ];
  for (const [config, message] of cases) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./api/index.js')"], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, VERCEL_ENV: 'production', DB_HOST: 'db.example.test',
        DB_PORT: '4000', DB_USER: 'synthetic', DB_PASSWORD: 'synthetic-only',
        DB_NAME: 'synthetic', ...config }, encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(message));
    assert.ok(!result.stderr.includes('synthetic-only'));
  }
});

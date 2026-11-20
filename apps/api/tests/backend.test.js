import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { migrate, openDatabase } from '../src/db.js';
import { seed, syntheticUsers } from '../src/seed.js';

test('migration is repeatable; seed inserts only synthetic users once', () => {
  const db = openDatabase(':memory:');
  try {
    assert.deepEqual(migrate(db), ['001_initial_schema.sql']);
    assert.deepEqual(migrate(db), []);
    assert.equal(seed(db), 2);
    assert.equal(seed(db), 0);
    assert.equal(db.prepare('SELECT count(*) AS count FROM users').get().count, 2);
    assert.deepEqual(db.prepare('SELECT email FROM users ORDER BY email').all().map((row) => row.email),
      syntheticUsers.map((user) => user.email).sort());
    assert.throws(() => db.prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?)').run('X', 'x@example.test', 'admin'));
    assert.throws(() => db.prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?)').run('X', 'STUDENT@example.test', 'student'));
  } finally {
    db.close();
  }
});

test('health and API error responses', async (t) => {
  const db = openDatabase(':memory:');
  migrate(db);
  const server = createApp(db).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', database: 'connected' });

  const missing = await fetch(base + '/api/unknown');
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: { code: 'NOT_FOUND', message: 'Route not found' } });

  const malformed = await fetch(base + '/api/unknown', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"oops":'
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } });
});

test('Jahid validation handlers run through Express and do not persist users', async (t) => {
  const db = openDatabase(':memory:');
  migrate(db);
  const server = createApp(db).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (path, data) => fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  });
  const goodRegistration = { name: 'Example Student', email: 'student@example.test', password: 'SafePassword123', role: 'student' };
  const registered = await post('/api/sample/register-validation', goodRegistration);
  assert.equal(registered.status, 200);
  assert.deepEqual(await registered.json(), { valid: true, message: 'Input format accepted; no account created' });

  const invalid = await post('/api/sample/register-validation', { ...goodRegistration, email: 'bad-email' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {
    error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { email: 'Valid email required' } }
  });

  const validLogin = await post('/api/sample/login-validation', { email: 'student@example.test', password: 'anything' });
  assert.equal(validLogin.status, 200);
  assert.deepEqual(await validLogin.json(), { valid: true, message: 'Input format accepted; no account created' });

  const invalidLogin = await post('/api/sample/login-validation', { email: 'not-an-email', password: '' });
  assert.equal(invalidLogin.status, 400);
  assert.deepEqual(await invalidLogin.json(), {
    error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: {
      email: 'Valid email required', password: 'Password required'
    } }
  });

  const malformed = await fetch(base + '/api/sample/register-validation', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"broken":'
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    error: { code: 'INVALID_JSON', message: 'Invalid JSON body' }
  });

  const missingRoute = await post('/api/sample/unknown', {});
  assert.equal(missingRoute.status, 404);
  assert.deepEqual(await missingRoute.json(), {
    error: { code: 'NOT_FOUND', message: 'Route not found' }
  });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
});

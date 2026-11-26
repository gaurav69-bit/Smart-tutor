import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRegistration } from './registration.js';
import { verifyPassword } from './password.js';

test('prepares valid registration with hashed password', async () => {
  const result = await prepareRegistration({
    name: ' Test Student ',
    email: 'STUDENT@example.test',
    password: 'TestPassword123',
    role: 'student'
  });

  assert.equal(result.valid, true);
  assert.equal(result.account.name, 'Test Student');
  assert.equal(result.account.email, 'student@example.test');
  assert.equal(result.account.role, 'student');
  assert.notEqual(result.account.passwordHash, 'TestPassword123');
  assert.equal(await verifyPassword('TestPassword123', result.account.passwordHash), true);
});

test('rejects invalid email', async () => {
  const result = await prepareRegistration({
    name: 'Test Student',
    email: 'invalid-email',
    password: 'TestPassword123',
    role: 'student'
  });

  assert.equal(result.valid, false);
  assert.equal(result.errors.email, 'Valid email required');
});

test('rejects public administrator registration', async () => {
  const result = await prepareRegistration({
    name: 'Test Admin',
    email: 'admin@example.test',
    password: 'TestPassword123',
    role: 'admin'
  });

  assert.equal(result.valid, false);
});

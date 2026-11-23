import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password.js';

test('password hashing and verification', async () => {
  const password = 'TestPassword123';
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('WrongPassword', hash), false);
});

test('different salts produce different hashes', async () => {
  const first = await hashPassword('TestPassword123');
  const second = await hashPassword('TestPassword123');

  assert.notEqual(first, second);
});

test('rejects invalid password and hash', async () => {
  await assert.rejects(hashPassword('short'));
  assert.equal(await verifyPassword('TestPassword123', 'invalid'), false);
});

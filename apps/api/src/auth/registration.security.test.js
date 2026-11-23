import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRegistration } from './registration.js';
import { hashPassword, verifyPassword } from './password.js';

test('ST-69: invalid request bodies fail without creating an account', async () => {
  for (const body of [null, [], 'not-an-object', 123, true]) {
    const result = await prepareRegistration(body);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, { body: 'Expected an object' });
    assert.equal(Object.hasOwn(result, 'account'), false);
  }
});

test('ST-69: missing fields and prohibited public roles are rejected', async () => {
  const missing = await prepareRegistration({});
  assert.equal(missing.valid, false);
  assert.deepEqual(Object.keys(missing.errors).sort(), ['email', 'name', 'password', 'role']);
  assert.equal(Object.hasOwn(missing, 'account'), false);

  for (const role of ['admin', 'administrator', 'superadmin', null, 'STUDENT']) {
    const result = await prepareRegistration({
      name: 'Example User',
      email: 'user@example.test',
      password: 'SafePassword123',
      role
    });
    assert.equal(result.valid, false);
    assert.equal(result.errors.role, 'Role must be student or tutor');
    assert.equal(Object.hasOwn(result, 'account'), false);
  }
});

test('ST-69: validation failures must not echo submitted secrets', async () => {
  const secret = 'DO-NOT-ECHO-secret-123456789';
  const result = await prepareRegistration({
    name: 'Example User',
    email: 'not-an-email',
    password: secret,
    role: 'student'
  });
  assert.equal(result.valid, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(Object.hasOwn(result, 'account'), false);
});

test('ST-69: no plaintext password appears in the prepared account', async () => {
  const secret = 'Valid-unique-password-9283';
  const result = await prepareRegistration({
    name: 'Student',
    email: 'user@example.test',
    password: secret,
    role: 'student'
  });
  assert.equal(result.valid, true);
  assert.equal(Object.hasOwn(result.account, 'password'), false);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(await verifyPassword(secret, result.account.passwordHash), true);
});

test('ST-69: password helper rejects out-of-policy lengths', async () => {
  await assert.rejects(hashPassword('x'.repeat(7)), /Invalid password length/);
  await assert.rejects(hashPassword('x'.repeat(129)), /Invalid password length/);
  assert.equal(await verifyPassword('anything', 'not-a-valid-hash'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistration, validateLogin } from '../src/validation.js';
test('valid registration', () => assert.equal(validateRegistration({ name: 'Student', email: 's@example.com', password: 'safePassword123', role: 'student' }).valid, true));
test('invalid registration email', () => assert.equal(validateRegistration({ name: 'Student', email: 'bad', password: 'safePassword123', role: 'student' }).valid, false));
test('invalid role', () => assert.equal(validateRegistration({ name: 'Student', email: 's@example.com', password: 'safePassword123', role: 'admin' }).valid, false));
test('missing password', () => assert.equal(validateLogin({ email: 's@example.com' }).valid, false));
test('valid login format', () => assert.equal(validateLogin({ email: 's@example.com', password: 'password' }).valid, true));

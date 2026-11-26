import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVerificationToken, hashVerificationToken, isVerificationTokenValid
} from './verification-token.js';

test('ST-70: generated token uses 32 random bytes and stores only a digest', () => {
  const first = createVerificationToken({ now: 1000, ttlMs: 60000 });
  const second = createVerificationToken({ now: 1000, ttlMs: 60000 });
  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.token, first.tokenHash);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(first.tokenHash, hashVerificationToken(first.token));
  assert.equal(first.expiresAt, 61000);
});

test('ST-70: valid token is accepted before expiry, rejected at expiry', () => {
  const { token, tokenHash, expiresAt } = createVerificationToken({ now: 1000, ttlMs: 500 });
  const record = { tokenHash, expiresAt, consumedAt: null };
  assert.equal(isVerificationTokenValid(token, record, { now: 1499 }), true);
  assert.equal(isVerificationTokenValid(token, record, { now: 1500 }), false);
  assert.equal(isVerificationTokenValid(token, record, { now: 1501 }), false);
});

test('ST-70: wrong token, malformed token, and consumed token are rejected', () => {
  const a = createVerificationToken({ now: 1000, ttlMs: 1000 });
  const b = createVerificationToken({ now: 1000, ttlMs: 1000 });
  const record = { tokenHash: a.tokenHash, expiresAt: a.expiresAt, consumedAt: null };
  assert.equal(isVerificationTokenValid(b.token, record, { now: 1100 }), false);
  assert.equal(isVerificationTokenValid('bad-token', record, { now: 1100 }), false);
  assert.equal(isVerificationTokenValid(a.token, { ...record, consumedAt: 1200 }, { now: 1300 }), false);
  assert.equal(isVerificationTokenValid(a.token, null, { now: 1100 }), false);
  assert.equal(isVerificationTokenValid(a.token, { ...record, tokenHash: 'invalid' }, { now: 1100 }), false);
});

test('ST-70: invalid expiry and malformed tokens are rejected safely', () => {
  assert.throws(() => createVerificationToken({ now: -1 }), RangeError);
  assert.throws(() => createVerificationToken({ ttlMs: 0 }), RangeError);
  assert.throws(() => createVerificationToken({ now: Number.MAX_SAFE_INTEGER, ttlMs: 1 }), RangeError);
  assert.throws(() => hashVerificationToken('malformed'), TypeError);
});

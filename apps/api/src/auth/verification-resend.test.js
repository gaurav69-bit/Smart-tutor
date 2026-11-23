import test from 'node:test';
import assert from 'node:assert/strict';
import { canResendVerification } from './verification-resend.js';

test('ST-70: first verification email is eligible for sending', () => {
  assert.deepEqual(canResendVerification({ now: 1000, cooldownMs: 60000 }),
    { allowed: true, retryAfterMs: 0 });
});

test('ST-70: resend cooldown denies early retry and reports precise remaining delay', () => {
  assert.deepEqual(canResendVerification({ now: 1000, lastSentAt: 900, cooldownMs: 60000 }),
    { allowed: false, retryAfterMs: 59900 });
  assert.deepEqual(canResendVerification({ now: 61000, lastSentAt: 1000, cooldownMs: 60000 }),
    { allowed: true, retryAfterMs: 0 });
});

test('ST-70: invalid cooldown or clock values are rejected', () => {
  assert.throws(() => canResendVerification({ now: -1, cooldownMs: 60000 }), RangeError);
  assert.throws(() => canResendVerification({ now: 1000, cooldownMs: 0 }), RangeError);
  assert.throws(() => canResendVerification({ now: 1000, lastSentAt: 2000, cooldownMs: 60000 }), RangeError);
  assert.throws(() => canResendVerification({ now: 1000, lastSentAt: -1, cooldownMs: 60000 }), RangeError);
});

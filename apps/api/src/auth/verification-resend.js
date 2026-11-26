// Rate-limit decision helper only; storage and mail delivery are owned by ST-106/ST-70.
// Callers must persist lastSentAt atomically before attempting to dispatch email.
export function canResendVerification({ now, lastSentAt = null, cooldownMs }) {
  if (!Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(cooldownMs) || cooldownMs <= 0) {
    throw new RangeError('Invalid resend policy');
  }
  if (lastSentAt == null) return { allowed: true, retryAfterMs: 0 };
  if (!Number.isSafeInteger(lastSentAt) || lastSentAt < 0 || lastSentAt > now) {
    throw new RangeError('Invalid last send timestamp');
  }
  const elapsed = now - lastSentAt;
  const remaining = Math.max(0, cooldownMs - elapsed);
  return { allowed: remaining === 0, retryAfterMs: remaining };
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // Proposed default; contract owner must confirm.
const TOKEN_HEX_PATTERN = /^[0-9a-f]{64}$/;

export function hashVerificationToken(token) {
  if (typeof token !== 'string' || !TOKEN_HEX_PATTERN.test(token)) {
    throw new TypeError('Invalid verification token');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createVerificationToken({ now = Date.now(), ttlMs = DEFAULT_TTL_MS } = {}) {
  if (!Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(ttlMs) || ttlMs <= 0 ||
      !Number.isSafeInteger(now + ttlMs)) {
    throw new RangeError('Invalid verification token expiry');
  }
  const token = randomBytes(32).toString('hex');
  return {
    // Only the digest must be stored in the database. Send token through approved mail transport.
    token,
    tokenHash: hashVerificationToken(token),
    expiresAt: now + ttlMs
  };
}

// This is a pure eligibility check, not a single-use guarantee. ST-106's persistence
// must atomically consume a token so two concurrent requests cannot both succeed.
export function isVerificationTokenValid(token, record, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || !TOKEN_HEX_PATTERN.test(token) ||
      !record || typeof record !== 'object' ||
      typeof record.tokenHash !== 'string' || !TOKEN_HEX_PATTERN.test(record.tokenHash) ||
      !Number.isSafeInteger(record.expiresAt) ||
      !Number.isSafeInteger(now) || now < 0 ||
      record.consumedAt != null) return false;

  const presented = Buffer.from(hashVerificationToken(token), 'hex');
  const stored = Buffer.from(record.tokenHash, 'hex');
  return now < record.expiresAt && timingSafeEqual(presented, stored);
}

import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'st_session';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // Proposed; confirm with team.
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function hashSessionToken(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new TypeError('Invalid session token');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createSessionToken({ now = Date.now(), ttlMs = SESSION_TTL_MS } = {}) {
  if (!Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(ttlMs) || ttlMs <= 0 ||
      !Number.isSafeInteger(now + ttlMs)) {
    throw new RangeError('Invalid session expiry');
  }
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashSessionToken(token), expiresAt: now + ttlMs };
}

export function readSessionCookie(header) {
  if (typeof header !== 'string') return null;
  for (const segment of header.split(';')) {
    const [key, ...value] = segment.trim().split('=');
    if (key === SESSION_COOKIE_NAME) {
      const token = value.join('=');
      return TOKEN_PATTERN.test(token) ? token : null;
    }
  }
  return null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionToken, hashSessionToken, readSessionCookie,
  SESSION_COOKIE_NAME, SESSION_TTL_MS, sessionCookieOptions
} from './session-token.js';

test('ST-71: opaque session tokens are random and only digest is stored', () => {
  const first = createSessionToken({ now: 1000 });
  const second = createSessionToken({ now: 1000 });
  assert.match(first.token, /^[0-9a-f]{64}$/);
  assert.match(first.tokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(first.token, first.tokenHash);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashSessionToken(first.token));
  assert.equal(first.expiresAt, 1000 + SESSION_TTL_MS);
});

test('ST-71: cookie parser accepts only exact, valid session token', () => {
  const { token } = createSessionToken();
  assert.equal(readSessionCookie(`other=1; ${SESSION_COOKIE_NAME}=${token}; x=2`), token);
  assert.equal(readSessionCookie('st_session=bad'), null);
  assert.equal(readSessionCookie('other=1'), null);
  assert.equal(readSessionCookie(null), null);
  assert.equal(readSessionCookie(`not_st_session=${token}`), null);
});

test('ST-71: cookie policy requires HttpOnly and production Secure', () => {
  const options = sessionCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.path, '/');
  assert.equal(options.secure, process.env.NODE_ENV === 'production');
});

test('ST-71: invalid session parameters cannot create a token', () => {
  assert.throws(() => createSessionToken({ now: -1 }), RangeError);
  assert.throws(() => createSessionToken({ ttlMs: 0 }), RangeError);
  assert.throws(() => createSessionToken({ now: Number.MAX_SAFE_INTEGER }), RangeError);
  assert.throws(() => hashSessionToken('invalid'), TypeError);
});

test('ST-71: production session cookies always include Secure flag', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal(sessionCookieOptions().secure, true);
    assert.equal(sessionCookieOptions().httpOnly, true);
    process.env.NODE_ENV = 'development';
    assert.equal(sessionCookieOptions().secure, false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

import { validateLogin } from '../../../../week3-jahid/src/validation.js';
import {
  createSessionToken, hashSessionToken, readSessionCookie,
  SESSION_COOKIE_NAME, SESSION_TTL_MS, sessionCookieOptions
} from './session-token.js';

const genericLoginError = {
  error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials or account not available' }
};

// Password authentication, verified-email checks and session persistence
// must be implemented by ST-106-compatible adapters. Never issue a cookie
// until durable session storage confirms success.
export function loginHandler({ authenticatePassword, persistSession } = {}) {
  return async (req, res, next) => {
    const validation = validateLogin(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: validation.errors }
      });
    }
    if (typeof authenticatePassword !== 'function' || typeof persistSession !== 'function') {
      return res.status(503).json({
        error: { code: 'LOGIN_UNAVAILABLE', message: 'Login is not yet available' }
      });
    }
    try {
      const account = await authenticatePassword(req.body.email.toLowerCase(), req.body.password);
      if (!account || !account.id || account.verified !== true ||
          !['student', 'tutor'].includes(account.role)) {
        return res.status(401).json(genericLoginError);
      }
      const session = createSessionToken();
      const stored = await persistSession({
        accountId: account.id,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt
      });
      if (stored !== true) {
        return res.status(503).json({
          error: { code: 'LOGIN_UNAVAILABLE', message: 'Login is not yet available' }
        });
      }
      res.cookie(SESSION_COOKIE_NAME, session.token, {
        ...sessionCookieOptions(), maxAge: SESSION_TTL_MS
      });
      return res.status(200).json({
        account: { id: account.id, name: account.name, email: account.email, role: account.role }
      });
    } catch (error) {
      return next(error);
    }
  };
}

export function logoutHandler({ revokeSession } = {}) {
  return async (req, res, next) => {
    const token = readSessionCookie(req.headers.cookie);
    if (!token) {
      res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
      return res.status(204).end();
    }
    if (typeof revokeSession !== 'function') {
      return res.status(503).json({
        error: { code: 'LOGOUT_UNAVAILABLE', message: 'Logout is not yet available' }
      });
    }
    try {
      await revokeSession(hashSessionToken(token));
      res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  };
}

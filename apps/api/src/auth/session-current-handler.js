import { hashSessionToken, readSessionCookie } from './session-token.js';

// ST-106 must implement lookupSession(tokenHash) against durable storage,
// including revocation. A valid cookie alone never authorizes access.
export function currentSessionHandler(lookupSession) {
  return async (req, res, next) => {
    const token = readSessionCookie(req.headers.cookie);
    if (!token) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }
    if (typeof lookupSession !== 'function') {
      return res.status(503).json({
        error: { code: 'SESSION_UNAVAILABLE', message: 'Session validation is not yet available' }
      });
    }
    try {
      const session = await lookupSession(hashSessionToken(token));
      const account = session?.account;
      if (!session || !Number.isSafeInteger(session.expiresAt) ||
          Date.now() >= session.expiresAt || session.revokedAt != null ||
          !account?.id || account.verified !== true ||
          !['student', 'tutor'].includes(account.role)) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }
      return res.status(200).json({
        account: { id: account.id, name: account.name, email: account.email, role: account.role }
      });
    } catch (error) {
      return next(error);
    }
  };
}

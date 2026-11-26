import { hashVerificationToken } from './verification-token.js';

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

// Transport only: ST-106 must implement atomic consumeVerificationToken(tokenHash).
// No account is marked verified until that adapter commits its transaction.
export function verificationHandler(consumeVerificationToken) {
  return async (req, res, next) => {
    const token = req.body?.token;
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid verification token' }
      });
    }
    if (typeof consumeVerificationToken !== 'function') {
      return res.status(503).json({
        error: { code: 'VERIFICATION_UNAVAILABLE', message: 'Verification is not yet available' }
      });
    }
    try {
      // The adapter must check expiration and single-use atomically.
      // Only the hash reaches persistence; the raw token is never logged.
      const consumed = await consumeVerificationToken(hashVerificationToken(token));
      if (consumed !== true) {
        return res.status(400).json({
          error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Invalid or expired verification token' }
        });
      }
      return res.status(200).json({ verified: true });
    } catch (error) {
      return next(error);
    }
  };
}

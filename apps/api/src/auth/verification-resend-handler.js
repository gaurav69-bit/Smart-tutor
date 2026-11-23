// HTTP boundary only. ST-106 must atomically enforce cooldown, account eligibility,
// and durable outbox insertion before resolving this adapter.
// Generic responses deliberately do not disclose whether an email is registered.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function resendVerificationHandler(queueVerificationResend) {
  return async (req, res, next) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof body.email !== 'string' || body.email.length > 200 ||
        !emailPattern.test(body.email)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Valid email required' }
      });
    }

    if (typeof queueVerificationResend !== 'function') {
      return res.status(503).json({
        error: { code: 'VERIFICATION_UNAVAILABLE', message: 'Verification is not yet available' }
      });
    }

    try {
      const email = body.email.toLowerCase();
      // Adapter MUST handle unknown/verified accounts and cooldown without leaking
      // existence, and commit an eligible resend to the durable outbox atomically.
      await queueVerificationResend(email);
      return res.status(202).json({
        message: 'If the account is eligible, a verification email will be sent'
      });
    } catch (error) {
      return next(error);
    }
  };
}

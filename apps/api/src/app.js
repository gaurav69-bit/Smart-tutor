import express from 'express';
import { registrationHandler } from './auth/registration-handler.js';
import { verificationHandler } from './auth/verification-handler.js';
import { resendVerificationHandler } from './auth/verification-resend-handler.js';
import { loginHandler, logoutHandler } from './auth/session-handler.js';
import { currentSessionHandler } from './auth/session-current-handler.js';
// Reuse Jahid Hasan's validation-only functions; do not start his standalone HTTP server.
import { validateRegistration, validateLogin } from '../../../week3-jahid/src/validation.js';

export function createApp(db, {
  registerAccount,
  validateProfileAndConsent,
  consumeVerificationToken,
  queueVerificationResend,
  authenticatePassword,
  persistSession,
  revokeSession,
  lookupSession,
  checkRateLimit,
  allowedOrigin
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Parse valid JSON arrays/null too so validators can return their field-safe 400 response.
  app.use(express.json({ limit: '16kb', strict: false }));

  app.get('/api/health', async (_req, res) => {
    try {
      if (typeof db.prepare === 'function') {
        db.prepare('SELECT 1 AS ok').get();
      } else {
        await db.raw('SELECT 1 AS ok');
      }
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  });

  app.use('/api/auth', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  if (typeof checkRateLimit === 'function') {
    if (process.env.VERCEL) app.set('trust proxy', 1);
    app.use('/api/auth', async (req, res, next) => {
      if (req.method !== 'POST') return next();
      // JSON and same-origin checks protect cookie mutations against cross-site forms.
      if (!req.is('application/json') && !req.path.endsWith('/logout')) {
        return res.status(415).json({ error: { code: 'JSON_REQUIRED', message: 'JSON required' } });
      }
      const origin = req.headers.origin;
      if (origin && origin !== allowedOrigin) {
        return res.status(403).json({ error: { code: 'INVALID_ORIGIN', message: 'Request not allowed' } });
      }
      const scope = req.path;
      const allowed = await checkRateLimit(scope, req.ip || 'unknown', scope === '/register' ? 10 : 30);
      if (!allowed) {
        res.set('Retry-After', '900');
        return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Please try again later' } });
      }
      next();
    });
  }

  app.post('/api/auth/register', registrationHandler(registerAccount, validateProfileAndConsent));
  app.post('/api/auth/verify-email', verificationHandler(consumeVerificationToken));
  app.post('/api/auth/resend-verification', resendVerificationHandler(queueVerificationResend));
  app.post('/api/auth/login', loginHandler({ authenticatePassword, persistSession }));
  app.post('/api/auth/logout', logoutHandler({ revokeSession }));
  app.get('/api/auth/me', currentSessionHandler(lookupSession));

  // Demo-only routes: validate submitted formats; never create accounts or sessions.
  const validationResponse = (validate) => (req, res) => {
    const result = validate(req.body);
    if (!result.valid) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: result.errors }
      });
    }
    return res.json({ valid: true, message: 'Input format accepted; no account created' });
  };
  app.post('/api/sample/register-validation', validationResponse(validateRegistration));
  app.post('/api/sample/login-validation', validationResponse(validateLogin));

  app.use((_req, res) => res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found' }
  }));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
    }
    if (err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: 'Invalid request' } });
    }
    // Never log raw adapter exceptions: they may contain credentials.
    console.error('Unhandled API error');
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
  });
  return app;
}

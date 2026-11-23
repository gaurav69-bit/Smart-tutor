import express from 'express';
import { verificationHandler } from './auth/verification-handler.js';
// Reuse Jahid Hasan's validation-only functions; do not start his standalone HTTP server.
import { validateRegistration, validateLogin } from '../../../week3-jahid/src/validation.js';

export function createApp(db, { consumeVerificationToken } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Parse valid JSON arrays/null too so validators can return their field-safe 400 response.
  app.use(express.json({ limit: '16kb', strict: false }));

  app.get('/api/health', (_req, res) => {
    try {
      db.prepare('SELECT 1 AS ok').get();
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  });

  app.post('/api/auth/verify-email', verificationHandler(consumeVerificationToken));

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
    console.error('Unhandled API error:', err);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
  });
  return app;
}

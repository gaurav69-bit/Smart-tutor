import { validateRegistration, validateLogin } from './validation.js';
export function errorResponse(message, details = {}) {
  return { error: { code: 'VALIDATION_ERROR', message, details } };
}
export async function handleRequest(req, res) {
  const routes = { '/api/sample/register-validation': validateRegistration, '/api/sample/login-validation': validateLogin };
  const validate = routes[req.url];
  if (req.method !== 'POST' || !validate) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
    return;
  }
  let raw = '';
  try {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 16384) throw new Error('Request too large');
    }
    const result = validate(JSON.parse(raw));
    res.writeHead(result.valid ? 200 : 400, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.valid ? { valid: true, message: 'Input format accepted; no account created' } : errorResponse('Invalid input', result.errors)));
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify(errorResponse('Invalid JSON or request body')));
  }
}

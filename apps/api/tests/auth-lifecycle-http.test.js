import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { verifyPassword } from '../src/auth/password.js';
import { createVerificationToken } from '../src/auth/verification-token.js';

test('the six auth routes share one account lifecycle with in-memory fixture adapters', async (t) => {
  const email = 'student@example.test';
  const credentials = { email, password: 'StrongTestOnlyPassword123' };
  const verification = createVerificationToken();
  const queuedEmails = [];
  const sessions = new Map();
  let account;
  let verificationConsumed = false;

  const server = createApp(null, {
    validateProfileAndConsent: () => ({ valid: true }),
    registerAccount: (prepared) => {
      account = { ...prepared, id: 1, verified: false };
      return account;
    },
    queueVerificationResend: (requestedEmail) => queuedEmails.push(requestedEmail),
    consumeVerificationToken: (tokenHash) => {
      if (verificationConsumed || tokenHash !== verification.tokenHash) return false;
      verificationConsumed = true;
      account.verified = true;
      return true;
    },
    authenticatePassword: async (submittedEmail, password) => {
      if (submittedEmail !== account?.email) return null;
      return (await verifyPassword(password, account.passwordHash)) ? account : null;
    },
    persistSession: (session) => {
      sessions.set(session.tokenHash, { ...session, account });
      return true;
    },
    lookupSession: (tokenHash) => sessions.get(tokenHash),
    revokeSession: (tokenHash) => {
      sessions.get(tokenHash).revokedAt = Date.now();
    }
  }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const post = (path, body, headers = {}) => fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });

  const registered = await post('/register', { ...credentials, name: 'Example Student', role: 'student' });
  assert.equal(registered.status, 201);
  const publicAccount = { id: 1, name: 'Example Student', email, role: 'student' };
  assert.deepEqual(await registered.json(), { account: { ...publicAccount, verified: false } });

  const unverified = await post('/login', credentials);
  assert.equal(unverified.status, 401);
  assert.equal(unverified.headers.get('set-cookie'), null);
  assert.equal(sessions.size, 0);

  const resend = await post('/resend-verification', { email: email.toUpperCase() });
  assert.equal(resend.status, 202);
  assert.deepEqual(queuedEmails, [email]);

  const verified = await post('/verify-email', { token: verification.token });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), { verified: true });
  assert.equal((await post('/verify-email', { token: verification.token })).status, 400);

  const login = await post('/login', credentials);
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { account: publicAccount });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const current = await fetch(base + '/me', { headers: { cookie } });
  assert.equal(current.status, 200);
  assert.deepEqual(await current.json(), { account: publicAccount });
  assert.equal((await post('/logout', {}, { cookie })).status, 204);
  assert.equal((await fetch(base + '/me', { headers: { cookie } })).status, 401);
});

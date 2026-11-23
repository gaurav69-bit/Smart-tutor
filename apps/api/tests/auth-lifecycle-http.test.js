import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createLocalMailCapture, verificationEmail } from '../src/auth/account-mail.js';
import { canResendVerification } from '../src/auth/verification-resend.js';
import { verifyPassword } from '../src/auth/password.js';
import { createVerificationToken } from '../src/auth/verification-token.js';

test('the six auth routes share one account lifecycle with in-memory fixture adapters', async (t) => {
  const email = 'student@example.test';
  const credentials = { email, password: 'StrongTestOnlyPassword123' };
  const now = Date.now();
  const cooldownMs = 60_000;
  const expired = createVerificationToken({ now: now - 1, ttlMs: 1 });
  const mail = createLocalMailCapture();
  const sessions = new Map();
  let account;
  let lastSentAt = null;
  let verification = { tokenHash: expired.tokenHash, expiresAt: expired.expiresAt };

  const server = createApp(null, {
    validateProfileAndConsent: () => ({ valid: true }),
    registerAccount: (prepared) => {
      account = { ...prepared, id: 1, verified: false };
      return account;
    },
    queueVerificationResend: async (requestedEmail) => {
      if (requestedEmail !== account?.email || account.verified) return;
      if (!canResendVerification({ now, lastSentAt, cooldownMs }).allowed) return;
      const { token, tokenHash, expiresAt } = createVerificationToken({ now });
      verification = { tokenHash, expiresAt };
      lastSentAt = now;
      const link = new URL('https://smart-tutor.example.test/verify');
      link.searchParams.set('token', token);
      await mail.send(verificationEmail(requestedEmail, link));
    },
    consumeVerificationToken: (tokenHash) => {
      if (!verification || verification.expiresAt <= now || tokenHash !== verification.tokenHash) {
        return false;
      }
      verification = null;
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

  const expiredResponse = await post('/verify-email', { token: expired.token });
  assert.equal(expiredResponse.status, 400);
  const rejection = await expiredResponse.json();
  assert.equal(rejection.error.code, 'INVALID_OR_EXPIRED_TOKEN');

  const resend = await post('/resend-verification', { email: email.toUpperCase() });
  assert.equal(resend.status, 202);
  const resendResponse = await resend.json();
  for (const requestedEmail of [email, 'unknown@example.test']) {
    const repeated = await post('/resend-verification', { email: requestedEmail });
    assert.equal(repeated.status, 202);
    assert.deepEqual(await repeated.json(), resendResponse);
  }

  const messages = mail.drain();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, email);
  const link = new URL(messages[0].textContent.split('\n')[1]);
  const token = link.searchParams.get('token');
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(token, expired.token);

  const verified = await post('/verify-email', { token });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), { verified: true });
  const replay = await post('/verify-email', { token });
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), rejection);

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

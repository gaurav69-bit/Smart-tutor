import { createHash } from 'node:crypto';
import { createAuthPersistenceAdapters } from './auth-persistence-adapters.js';
import { registerWithVerificationOutbox } from './registration-outbox.js';
import { createVerificationResendAdapter } from './verification-outbox-adapter.js';
import { validateRegistrationProfile } from './auth/registration-profile.js';
import { verifyPassword } from './auth/password.js';
import { createVerificationToken } from './auth/verification-token.js';
import { verificationEmail, createBrevoMailTransport } from './auth/account-mail.js';
import { processPendingOutbox } from './outbox-dispatcher.js';

export function createAccountRuntime(db, env = process.env, { send } = {}) {
  const appUrl = new URL(env.APP_URL);
  if (appUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(appUrl.hostname)) {
    throw new Error('APP_URL must use HTTPS');
  }
  if (appUrl.username || appUrl.password) throw new Error('Invalid APP_URL');
  const transport = send || createBrevoMailTransport({
    apiKey: env.BREVO_API_KEY, senderEmail: env.MAIL_FROM
  });
  const renderVerificationEmail = ({ email, token }) => {
    const url = new URL('/#/verify?token=' + token, appUrl.origin);
    const { subject, textContent } = verificationEmail(email, url);
    return { subject, body: textContent };
  };
  const dispatch = recipient => processPendingOutbox(db, { send: transport, limit: 1, recipient });
  return {
    allowedOrigin: appUrl.origin,
    ...createAuthPersistenceAdapters(db, { verifyPassword }),
    validateProfileAndConsent: validateRegistrationProfile,
    async registerAccount(account, profile) {
      const { token, expiresAt } = createVerificationToken();
      const message = renderVerificationEmail({ email: account.email, token });
      const result = await registerWithVerificationOutbox(db, {
        account, validatedProfile: profile, token, expiresAt, message
      });
      // Queue commits before delivery. A mail failure leaves an explicit retryable outbox.
      try { await dispatch(account.email); } catch { console.error('Account email dispatch unavailable'); }
      return result;
    },
    async queueVerificationResend(email) {
      await createVerificationResendAdapter(db, {
        createToken: () => createVerificationToken().token,
        renderVerificationEmail, tokenTtlMs: 30 * 60_000, cooldownMs: 60_000
      })(email);
      try { await dispatch(email); } catch { console.error('Account email dispatch unavailable'); }
    },
    async checkRateLimit(scope, identity, max, windowMs = 15 * 60_000) {
      const now = Date.now();
      const keyHash = createHash('sha256').update(scope + ':' + identity).digest('hex');
      return db.transaction(async trx => {
        await trx('auth_request_limits').insert({ key_hash: keyHash, attempts: 0, expires_at: now + windowMs })
          .onConflict('key_hash').ignore();
        await trx('auth_request_limits').where({ key_hash: keyHash }).where('expires_at', '<=', now)
          .update({ attempts: 0, expires_at: now + windowMs });
        await trx('auth_request_limits').where({ key_hash: keyHash }).increment('attempts', 1);
        const row = await trx('auth_request_limits').where({ key_hash: keyHash }).first();
        return row.attempts <= max;
      });
    }
  };
}

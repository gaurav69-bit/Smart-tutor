import { once } from 'node:events';
import knex from 'knex';
import { createApp } from '../src/app.js';
import { createAuthPersistenceAdapters } from '../src/auth-persistence-adapters.js';
import { setAccountApproval } from '../src/account-store.js';
import { registerWithVerificationOutbox } from '../src/registration-outbox.js';
import { createVerificationResendAdapter } from '../src/verification-outbox-adapter.js';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { processPendingOutbox } from '../src/outbox-dispatcher.js';
import { createLocalMailCapture, verificationEmail } from '../src/auth/account-mail.js';
import { verifyPassword } from '../src/auth/password.js';
import { createVerificationToken } from '../src/auth/verification-token.js';
import { validateRegistrationProfile } from '../src/auth/registration-profile.js';

// Used only by browser tests. The real profile, consent, approval and issuance policies remain open.
export async function startBrowserAuthFixture(browserOrigin) {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  const capture = createLocalMailCapture();
  const cooldownMs = 60_000;
  let clockOffset = 0;
  const renderVerificationEmail = ({ email, token }) => {
    const url = new URL('/#/verify?token=' + token, browserOrigin);
    const { subject, textContent } = verificationEmail(email, url);
    return { subject, body: textContent };
  };
  let server;
  async function close() {
    try {
      if (server?.listening) {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    } finally {
      await db.destroy();
    }
  }
  try {
    await migrateMySQL(db);
    server = createApp(db, {
      ...createAuthPersistenceAdapters(db, { verifyPassword }),
      registerAccount: (account, validatedProfile) => {
        const { token, expiresAt } = createVerificationToken();
        const message = renderVerificationEmail({ email: account.email, token });
        return registerWithVerificationOutbox(db, { account, validatedProfile, token, expiresAt, message });
      },
      queueVerificationResend: createVerificationResendAdapter(db, {
        createToken: () => createVerificationToken().token,
        renderVerificationEmail,
        // Fixture values exercise the proposed UI cooldown without setting deployment policy.
        tokenTtlMs: 30 * 60_000,
        cooldownMs,
        now: () => Date.now() + clockOffset
      }),
      validateProfileAndConsent: validateRegistrationProfile
    }).listen(3001, '127.0.0.1');
    await once(server, 'listening');
  } catch (error) {
    await close();
    throw error;
  }

  return {
    close,
    advancePastResendCooldown() { clockOffset += cooldownMs + 1000; },
    async dispatchVerificationMail() {
      const result = await processPendingOutbox(db, { send: capture.send });
      return { messages: capture.drain(), result };
    },
    async approve(email) {
      const account = await db('users').where({ email }).first('id');
      if (!account) throw new Error('The browser did not persist the synthetic account');
      return setAccountApproval(db, account.id, 'approved');
    }
  };
}

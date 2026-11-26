import { once } from 'node:events';
import knex from 'knex';
import { createApp } from '../src/app.js';
import { createAuthPersistenceAdapters } from '../src/auth-persistence-adapters.js';
import { enqueueEmail, setAccountApproval, storeEmailVerification } from '../src/account-store.js';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { processPendingOutbox } from '../src/outbox-dispatcher.js';
import { createLocalMailCapture, verificationEmail } from '../src/auth/account-mail.js';
import { verifyPassword } from '../src/auth/password.js';
import { createVerificationToken } from '../src/auth/verification-token.js';

// Used only by browser tests. The real profile, consent, approval and issuance policies remain open.
export async function startBrowserAuthFixture() {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  const capture = createLocalMailCapture();
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
      validateProfileAndConsent: ({ terms, bio }) => terms === true
        ? { valid: true, profile: { bio } }
        : { valid: false, errors: { terms: 'Terms must be accepted' } }
    }).listen(3001, '127.0.0.1');
    await once(server, 'listening');
  } catch (error) {
    await close();
    throw error;
  }

  return {
    close,
    async issueVerification(email, browserOrigin) {
      const account = await db('users').where({ email }).first();
      if (!account) throw new Error('The browser did not persist the synthetic account');
      const { token, expiresAt } = createVerificationToken();
      const link = new URL('/#/verify?token=' + token, browserOrigin);
      const message = verificationEmail(email, link);
      await storeEmailVerification(db, { userId: account.id, token, expiresAt: new Date(expiresAt) });
      await enqueueEmail(db, {
        userId: account.id, recipient: message.to, subject: message.subject, body: message.textContent
      });
      const result = await processPendingOutbox(db, { send: capture.send });
      return { accountId: account.id, messages: capture.drain(), result };
    },
    approve: accountId => setAccountApproval(db, accountId, 'approved')
  };
}

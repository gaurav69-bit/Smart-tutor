import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createDatabaseConnection } from '../src/database-connection.js';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { createAuthPersistenceAdapters } from '../src/auth-persistence-adapters.js';
import { createHash } from 'node:crypto';
import { processPendingOutbox } from '../src/outbox-dispatcher.js';
import { createVerificationResendAdapter } from '../src/verification-outbox-adapter.js';
import { registerWithVerificationOutbox } from '../src/registration-outbox.js';
import {
  createAccount, findAccountByEmail, enqueueEmail, getPendingEmails
} from '../src/account-store.js';

// Run only in an isolated disposable MySQL database. Never point at hosted TiDB.
test('real MySQL: migrations, duplicate emails, transactional rollback and persistence', {
  skip: process.env.TEST_MYSQL !== '1'
}, async () => {
  if (process.env.DB_CLIENT !== 'mysql2' || process.env.DB_NAME !== 'smarttutor_test') {
    throw new Error('MySQL integration tests require DB_CLIENT=mysql2 and DB_NAME=smarttutor_test');
  }
  const db = createDatabaseConnection();
  try {
    const applied = await migrateMySQL(db);
    assert.deepEqual(applied, ['001_initial_schema', '002_account_identity_and_outbox', '003_account_states_and_delivery_audit', '004_registration_profiles_and_limits']);
    assert.deepEqual(await migrateMySQL(db), []);
    // Exercise the running Express health route against the actual MySQL connection.
    const server = createApp(db).listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/health');
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    const account = await createAccount(db, {
      name: 'MySQL Example', email: 'mysql@example.test', role: 'student',
      passwordHash: 'argon2id$synthetic-ci-only'
    });
    assert.equal((await findAccountByEmail(db, 'MYSQL@EXAMPLE.TEST')).id, account.id);
    await assert.rejects(createAccount(db, {
      name: 'Duplicate Example', email: 'MYSQL@EXAMPLE.TEST', role: 'tutor',
      passwordHash: 'synthetic-hash'
    }));
    assert.equal(Number((await db('users').count({ n: '*' }).first()).n), 1);
    // Race two independent transactions on the same email. The database unique
    // index must permit exactly one insert, regardless of scheduling.
    const racers = await Promise.allSettled([
      createAccount(db, {
        name: 'Concurrent A', email: 'race@example.test', role: 'student',
        passwordHash: 'argon2id$synthetic-a'
      }),
      createAccount(db, {
        name: 'Concurrent B', email: 'RACE@example.test', role: 'tutor',
        passwordHash: 'argon2id$synthetic-b'
      })
    ]);
    assert.equal(racers.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(racers.filter((r) => r.status === 'rejected').length, 1);
    assert.equal(Number((await db('users').where('email', 'race@example.test').count({ n: '*' }).first()).n), 1);
    assert.equal(Number((await db('account_profiles').count({ n: '*' }).first()).n), 2);
    // Test ST-106 compatibility with Jahid's injected storage interface on real MySQL.
    const auth = createAuthPersistenceAdapters(db, {
      verifyPassword: async (password, stored) =>
        password === 'synthetic-password' && stored === 'scrypt:synthetic-only'
    });
    const integrated = await auth.registerAccount({
      name: 'Integrated Account', email: 'integration@example.test',
      role: 'student', passwordHash: 'scrypt:synthetic-only'
    }, { bio: 'MySQL integration' });
    assert.equal(await auth.authenticatePassword(integrated.email, 'synthetic-password'), null);
    await db('users').where({ id: integrated.id }).update({ approval_status: 'approved' });
    const tokenHash = createHash('sha256').update('synthetic-verification').digest('hex');
    await db('email_verifications').insert({
      user_id: integrated.id, token_hash: tokenHash,
      expires_at: new Date(Date.now() + 60000)
    });
    assert.equal(await auth.consumeVerificationToken(tokenHash), true);
    assert.equal(await auth.consumeVerificationToken(tokenHash), false);
    assert.equal((await auth.authenticatePassword(integrated.email, 'synthetic-password')).verified, true);
    const sessionHash = createHash('sha256').update('synthetic-session').digest('hex');
    assert.equal(await auth.persistSession({
      accountId: integrated.id, tokenHash: sessionHash,
      expiresAt: Date.now() + 60000
    }), true);
    assert.equal((await auth.lookupSession(sessionHash)).account.email, integrated.email);
    assert.equal(await auth.revokeSession(sessionHash), true);
    assert.ok((await auth.lookupSession(sessionHash)).revokedAt != null);

    const id = await enqueueEmail(db, {
      userId: account.id, recipient: 'mysql@example.test',
      subject: 'Test message', body: 'Synthetic email; no delivery'
    });
    assert.ok(id > 0);
    assert.equal((await getPendingEmails(db)).length, 1);
    // Exercise an explicit, synthetic transport; never invoke a live provider.
    const sent = [];
    const drain = await processPendingOutbox(db, {
      send: async (message) => {
        sent.push(message);
        return { messageId: 'mysql-synthetic-provider-acceptance' };
      }
    });
    assert.equal(drain.sent, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'mysql@example.test');
    assert.equal((await getPendingEmails(db)).length, 0);
    const attempt = await db('email_delivery_attempts')
      .where({ email_outbox_id: id }).first();
    assert.equal(attempt.outcome, 'sent');
    assert.equal(attempt.provider_message_id, 'mysql-synthetic-provider-acceptance');
    // Approval Pending: the proposed resend persistence transaction is tested
    // against disposable MySQL, not a live sender or hosted TiDB.
    const resend = createVerificationResendAdapter(db, {
      createToken: () => 'f'.repeat(64),
      renderVerificationEmail: ({ email, token }) => ({
        subject: 'Synthetic verification',
        body: 'https://example.test/#/verify?token=' + token + '&email=' + email
      }),
      tokenTtlMs: 30 * 60 * 1000,
      cooldownMs: 60 * 1000
    });
    await resend('mysql@example.test');
    await resend('mysql@example.test');
    assert.equal(Number((await db('email_verifications')
      .where({ user_id: account.id }).count({ n: '*' }).first()).n), 1);
    assert.equal((await getPendingEmails(db)).length, 1);
    const deliveredVerification = await processPendingOutbox(db, {
      send: async () => ({ messageId: 'synthetic-verification-accepted' })
    });
    assert.equal(deliveredVerification.sent, 1);
    assert.equal((await getPendingEmails(db)).length, 0);
    // Approval Pending: atomic initial registration and verification issuance
    // on disposable real MySQL, with a synthetic token and no live delivery.
    const registerToken = 'b'.repeat(64);
    const registered = await registerWithVerificationOutbox(db, {
      account: { name: 'Atomic Student', email: 'Atomic@Example.test',
        role: 'student', passwordHash: 'scrypt:synthetic-only' },
      validatedProfile: { bio: 'Synthetic MySQL account' },
      token: registerToken, expiresAt: Date.now() + 30 * 60_000,
      message: { subject: 'Synthetic initial verification',
        body: 'https://example.test/#/verify?token=' + registerToken }
    });
    assert.equal(registered.email, 'atomic@example.test');
    assert.equal((await db('email_verifications')
      .where({ user_id: registered.id }).first()).token_hash,
      createHash('sha256').update(registerToken).digest('hex'));
    await assert.rejects(registerWithVerificationOutbox(db, {
      account: { name: 'Duplicate Atomic', email: 'ATOMIC@example.test',
        role: 'student', passwordHash: 'scrypt:synthetic-only' },
      token: 'c'.repeat(64), expiresAt: Date.now() + 30 * 60_000,
      message: { subject: 'Synthetic', body: 'Synthetic message' }
    }), error => error.code === 'DUPLICATE_EMAIL');
    assert.equal(Number((await db('email_verifications')
      .where({ user_id: registered.id }).count({ n: '*' }).first()).n), 1);
    assert.equal((await getPendingEmails(db)).length, 1);
    assert.equal((await processPendingOutbox(db, {
      send: async () => ({ messageId: 'synthetic-registration-accepted' })
    })).sent, 1);
    assert.equal((await getPendingEmails(db)).length, 0);
  } finally {
    await db.destroy();
  }
  // Confirm that records persist after closing and opening a separate connection.
  const reopened = createDatabaseConnection();
  try {
    assert.equal((await findAccountByEmail(reopened, 'mysql@example.test')).name, 'MySQL Example');
    assert.equal((await getPendingEmails(reopened)).length, 0);
    assert.equal(Number((await reopened('email_outbox').where({ status: 'sent' }).count({ n: '*' }).first()).n), 3);
  } finally {
    await reopened.destroy();
  }
});

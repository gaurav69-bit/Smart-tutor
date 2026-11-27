// Operational acceptance on uniquely scoped disposable records. No email is sent.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { registerWithVerificationOutbox } from '../src/registration-outbox.js';

const expectedMigrations = [
  '001_initial_schema', '002_account_identity_and_outbox',
  '003_account_states_and_delivery_audit', '004_registration_profiles_and_limits'
];
const schema = {
  users: ['id', 'email', 'role', 'approval_status', 'email_verified_at'],
  account_profiles: ['user_id', 'bio'], account_secrets: ['user_id', 'password_hash'],
  email_verifications: ['token_hash', 'expires_at', 'used_at'],
  sessions: ['id', 'expires_at', 'revoked_at'], auth_tokens: ['token_hash'],
  email_outbox: ['recipient', 'status', 'attempts'], otp_challenges: ['challenge_hash'],
  email_delivery_attempts: ['provider_message_id'],
  account_registration_details: ['username', 'date_of_birth', 'terms_version', 'terms_accepted_at'],
  auth_request_limits: ['key_hash'], schema_migrations: ['name']
};
const count = async (db, table, where) => Number((await db(table).where(where).count({ n: '*' }).first()).n);

export async function checkHostedDatabase(db) {
  for (const [table, columns] of Object.entries(schema)) {
    assert.ok(await db.schema.hasTable(table), 'Required table missing: ' + table);
    for (const column of columns) {
      assert.ok(await db.schema.hasColumn(table, column), 'Required schema column missing');
    }
  }
  const ledger = async () => (await db('schema_migrations').orderBy('name').select('name')).map(r => r.name);
  assert.deepEqual(await ledger(), expectedMigrations, 'Schema must already match reviewed migrations');
  const marker = 'dbcheck_' + randomBytes(12).toString('hex');
  const email = marker + '@example.invalid';
  const rollbackEmail = marker + '_rollback@example.invalid';
  const emails = [email, rollbackEmail];
  const hashes = [marker + '_hash_a', marker + '_hash_b', marker + '_hash_rollback'];
  const bios = [marker + '_bio_a', marker + '_bio_b', marker + '_bio_rollback'];
  const input = (suffix, recipient = email, username = marker + '_' + suffix) => ({
    account: { name: 'Synthetic Database Check', email: recipient, role: 'student',
      passwordHash: marker + '_hash_' + suffix },
    validatedProfile: { username, subject: 'Synthetic database check', dob: '2000-01-01',
      address: 'Synthetic disposable record', bio: marker + '_bio_' + suffix, terms: true },
    token: randomBytes(32).toString('hex'), expiresAt: Date.now() + 30 * 60_000,
    message: { subject: 'Synthetic database check - do not send', body: 'Disposable transaction probe only.' }
  });
  const a = input('a'); const b = input('b', email.toUpperCase());
  const result = { schemaCompatibility: true };
  try {
    // Two independent transactions contend for the same normalized unique email.
    const attempts = await Promise.allSettled([
      registerWithVerificationOutbox(db, a), registerWithVerificationOutbox(db, b)
    ]);
    const successes = attempts.filter(r => r.status === 'fulfilled');
    const failures = attempts.filter(r => r.status === 'rejected');
    assert.equal(successes.length, 1, 'Concurrent duplicate check must create exactly one account');
    assert.equal(failures.length, 1, 'Concurrent duplicate check must reject exactly one account');
    assert.equal(failures[0].reason?.code, 'DUPLICATE_EMAIL');
    assert.equal(await count(db, 'users', { email }), 1);
    assert.equal(await count(db, 'email_outbox', { recipient: email }), 1);
    const id = successes[0].value.id;
    assert.equal(await count(db, 'account_secrets', { user_id: id }), 1);
    assert.equal(await count(db, 'account_profiles', { user_id: id }), 1);
    assert.equal(await count(db, 'email_verifications', { user_id: id }), 1);
    result.concurrentDuplicatePrevention = true;

    // A replay must change neither migration history nor the disposable account.
    assert.deepEqual(await migrateMySQL(db), [], 'Migration replay must be a no-op');
    assert.deepEqual(await ledger(), expectedMigrations);
    assert.equal(await count(db, 'users', { email }), 1);
    assert.equal(await count(db, 'email_outbox', { recipient: email }), 1);
    result.migrationReplay = true;

    // A real UNIQUE violation occurs after identity, secret and profile inserts.
    const details = await db('account_registration_details').where({ user_id: id }).first('username');
    const rollback = input('rollback', rollbackEmail, details.username);
    await assert.rejects(registerWithVerificationOutbox(db, rollback), e => e?.code === 'DUPLICATE_USERNAME');
    assert.equal(await count(db, 'users', { email: rollbackEmail }), 0);
    assert.equal(await count(db, 'account_secrets', { password_hash: rollback.account.passwordHash }), 0);
    assert.equal(await count(db, 'account_profiles', { bio: rollback.validatedProfile.bio }), 0);
    assert.equal(await count(db, 'email_verifications', {
      token_hash: createHash('sha256').update(rollback.token).digest('hex')
    }), 0);
    assert.equal(await count(db, 'email_outbox', { recipient: rollbackEmail }), 0);
    assert.equal(await count(db, 'users', { email }), 1);
    result.transactionRollback = true;
  } finally {
    // Only exact generated identities/markers are removed. No table resets or DDL.
    await db.transaction(async trx => {
      const ids = (await trx('users').whereIn('email', emails)
        .where({ name: 'Synthetic Database Check' }).select('id')).map(r => r.id);
      const outboxIds = (await trx('email_outbox').whereIn('recipient', emails).select('id')).map(r => r.id);
      if (outboxIds.length) await trx('email_delivery_attempts').whereIn('email_outbox_id', outboxIds).del();
      await trx('email_outbox').whereIn('recipient', emails).del();
      if (ids.length) {
        for (const table of ['otp_challenges', 'auth_tokens', 'sessions', 'email_verifications',
          'account_registration_details', 'account_profiles', 'account_secrets']) {
          await trx(table).whereIn('user_id', ids).del();
        }
        await trx('users').whereIn('id', ids).where({ name: 'Synthetic Database Check' }).del();
      }
      // These exact markers also clean up test-only orphans if a constraint failed.
      await trx('account_secrets').whereIn('password_hash', hashes).del();
      await trx('account_profiles').whereIn('bio', bios).del();
    });
    assert.equal(Number((await db('users').whereIn('email', emails).count({ n: '*' }).first()).n), 0);
    assert.equal(Number((await db('email_outbox').whereIn('recipient', emails).count({ n: '*' }).first()).n), 0);
    result.disposableDataCleaned = true;
  }
  return result;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import knex from 'knex';
import { migrateMySQL } from '../src/mysql-migrations.js';

function createTestDatabase() {
  return knex({
    client: 'better-sqlite3',
    connection: {
      filename: ':memory:'
    },
    useNullAsDefault: true
  });
}

test('Migration creates required tables', async () => {
  const db = createTestDatabase();

  try {
    const result = await migrateMySQL(db);

    assert.equal(await db.schema.hasTable('users'), true);
    assert.equal(
      await db.schema.hasTable('schema_migrations'),
      true
    );
    assert.deepEqual(result, ['001_initial_schema', '002_account_identity_and_outbox', '003_account_states_and_delivery_audit', '004_registration_profiles_and_limits']);
    assert.equal(await db.schema.hasColumn('users', 'approval_status'), true);
    assert.equal(await db.schema.hasColumn('users', 'email_verified_at'), true);
    for (const table of ['account_profiles', 'account_secrets', 'email_verifications', 'sessions', 'auth_tokens', 'email_outbox', 'otp_challenges', 'email_delivery_attempts']) {
      assert.equal(await db.schema.hasTable(table), true);
    }

    console.log('Migration creation: PASSED');
  } finally {
    await db.destroy();
  }
});

test('Migration does not run twice', async () => {
  const db = createTestDatabase();

  try {
    await migrateMySQL(db);

    const secondRun = await migrateMySQL(db);

    assert.deepEqual(secondRun, []);

    const records = await db('schema_migrations')
      .where({ name: '001_initial_schema' });

    assert.equal(records.length, 1);

    console.log('Migration replay protection: PASSED');
  } finally {
    await db.destroy();
  }
});

test('Migration protects existing untracked tables', async () => {
  const db = createTestDatabase();

  try {
    await db.schema.createTable('users', (table) => {
      table.increments('id').primary();
    });

    await assert.rejects(
      migrateMySQL(db),
      /existing untracked tables/
    );

    assert.equal(await db.schema.hasTable('users'), true);

    console.log('Existing table protection: PASSED');
  } finally {
    await db.destroy();
  }
});
import test from 'node:test';
import assert from 'node:assert/strict';
import knex from 'knex';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { createDatabaseConnection } from '../src/database-connection.js';
import { checkHostedDatabase } from '../scripts/check-hosted-database.js';

async function exercise(db) {
  try {
    await migrateMySQL(db);
    const result = await checkHostedDatabase(db);
    assert.deepEqual(result, { schemaCompatibility: true, concurrentDuplicatePrevention: true,
      migrationReplay: true, transactionRollback: true, disposableDataCleaned: true });
    assert.equal(Number((await db('users').where({ name: 'Synthetic Database Check' }).count({ n: '*' }).first()).n), 0);
  } finally { await db.destroy(); }
}
test('operational acceptance on disposable SQLite records', async () => {
  await exercise(knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true }));
});
test('operational acceptance on disposable MySQL', { skip: process.env.TEST_MYSQL !== '1' }, async () => {
  if (process.env.DB_NAME !== 'smarttutor_test' || process.env.DB_HOST !== '127.0.0.1') {
    throw new Error('Disposable loopback database required');
  }
  await exercise(createDatabaseConnection());
});

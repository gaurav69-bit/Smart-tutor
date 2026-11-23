import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseConnection } from '../src/database-connection.js';
import { migrateMySQL } from '../src/mysql-migrations.js';
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
    assert.deepEqual(applied, ['001_initial_schema', '002_account_identity_and_outbox', '003_account_states_and_delivery_audit']);
    assert.deepEqual(await migrateMySQL(db), []);
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
    const id = await enqueueEmail(db, {
      userId: account.id, recipient: 'mysql@example.test',
      subject: 'Test message', body: 'Synthetic email; no delivery'
    });
    assert.ok(id > 0);
    assert.equal((await getPendingEmails(db)).length, 1);
  } finally {
    await db.destroy();
  }
  // Confirm that records persist after closing and opening a separate connection.
  const reopened = createDatabaseConnection();
  try {
    assert.equal((await findAccountByEmail(reopened, 'mysql@example.test')).name, 'MySQL Example');
    assert.equal((await getPendingEmails(reopened)).length, 1);
  } finally {
    await reopened.destroy();
  }
});

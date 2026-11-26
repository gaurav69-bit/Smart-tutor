import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabaseConfig } from '../src/database-config.js';

const base = {
  DB_CLIENT: 'mysql2',
  DB_HOST: 'db.example.test',
  DB_PORT: '4000',
  DB_USER: 'test_user',
  DB_PASSWORD: 'synthetic-test-only',
  DB_NAME: 'test_db'
};

test('ST-104: hosted MySQL connections validate TLS by default', () => {
  const config = getDatabaseConfig(base);
  assert.equal(config.client, 'mysql2');
  assert.equal(config.connection.host, 'db.example.test');
  assert.equal(config.connection.port, 4000);
  assert.equal(config.connection.ssl.rejectUnauthorized, true);
});

test('ST-104: custom CA retains certificate verification and decodes escaped newlines', () => {
  const config = getDatabaseConfig({ ...base, DB_SSL_CA: 'BEGIN\\nTEST-CA\\nEND' });
  assert.equal(config.connection.ssl.ca, 'BEGIN\nTEST-CA\nEND');
  assert.equal(config.connection.ssl.rejectUnauthorized, true);
});

test('ST-104: TLS disables only when explicitly set to false for local development', () => {
  const local = getDatabaseConfig({ ...base, DB_SSL: 'false' });
  assert.equal(local.connection.ssl, undefined);
  const enabled = getDatabaseConfig({ ...base, DB_SSL: 'true' });
  assert.equal(enabled.connection.ssl.rejectUnauthorized, true);
});

test('ST-104: SQLite retains the existing local database support', () => {
  const config = getDatabaseConfig({ DB_CLIENT: 'sqlite3', DATABASE_FILE: ':memory:' });
  assert.equal(config.client, 'better-sqlite3');
  assert.equal(config.connection.filename, ':memory:');
  assert.equal(config.useNullAsDefault, true);
});

test('ST-104: unsupported clients fail closed', () => {
  assert.throws(() => getDatabaseConfig({ DB_CLIENT: 'unknown' }), /Unsupported DB_CLIENT/);
});

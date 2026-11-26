import { createApp } from '../apps/api/src/app.js';
import { migrate, openDatabase } from '../apps/api/src/db.js';
import { createAccountRuntime } from '../apps/api/src/account-runtime.js';
import { createDatabaseConnection } from '../apps/api/src/database-connection.js';

// Reuse a connection pool across warm invocations. Schema upgrades run separately.
const hosted = process.env.VERCEL_ENV === 'production';
const client = process.env.DB_CLIENT || (hosted ? 'mysql2' : 'sqlite3');
if (hosted && (client !== 'mysql2' || process.env.DB_SSL === 'false')) {
  throw new Error('Production requires MySQL with verified TLS');
}
if (!['mysql2', 'sqlite3'].includes(client)) throw new Error('Unsupported database client');
if (client === 'mysql2') {
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!process.env[key]?.trim()) throw new Error('Missing database configuration: ' + key);
  }
}
const db = client === 'mysql2' || process.env.ACCOUNTS_ENABLED === 'true'
  ? createDatabaseConnection(process.env)
  : openDatabase(':memory:');
if (client === 'sqlite3' && process.env.ACCOUNTS_ENABLED !== 'true') migrate(db);
const accountRuntime = process.env.ACCOUNTS_ENABLED === 'true'
  ? createAccountRuntime(db) : {};
const app = createApp(db, accountRuntime);

export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.searchParams.get('__route');
  if (path !== null) {
    url.searchParams.delete('__route');
    const query = url.searchParams.toString();
    req.url = '/api/' + path.replace(/^\/+/, '') + (query ? '?' + query : '');
  }
  return app(req, res);
}

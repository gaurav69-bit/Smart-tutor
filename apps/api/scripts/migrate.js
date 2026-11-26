import 'dotenv/config';
import { migrate, openDatabase } from '../src/db.js';
import { createDatabaseConnection } from '../src/database-connection.js';
import { migrateMySQL } from '../src/mysql-migrations.js';

const client = (process.env.DB_CLIENT || 'sqlite3').toLowerCase();
if (client === 'mysql2') {
  const db = createDatabaseConnection();
  try {
    const applied = await migrateMySQL(db);
    console.log('MySQL migrations applied:', applied.length ? applied.join(', ') : '(none; already current)');
  } finally {
    await db.destroy();
  }
} else if (client === 'sqlite3') {
  const db = openDatabase();
  try {
    const applied = migrate(db);
    console.log('SQLite migrations applied:', applied.length ? applied.join(', ') : '(none; already current)');
  } finally {
    db.close();
  }
} else {
  throw new Error('Unsupported DB_CLIENT: ' + client);
}

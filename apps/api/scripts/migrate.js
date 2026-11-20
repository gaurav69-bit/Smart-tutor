import 'dotenv/config';
import { migrate, openDatabase } from '../src/db.js';
const db = openDatabase();
try {
  const applied = migrate(db);
  console.log('Migrations applied:', applied.length ? applied.join(', ') : '(none; already current)');
} finally {
  db.close();
}

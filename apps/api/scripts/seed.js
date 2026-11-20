import 'dotenv/config';
import { migrate, openDatabase } from '../src/db.js';
import { seed } from '../src/seed.js';
if (process.env.NODE_ENV === 'production') {
  throw new Error('Synthetic seed data must not be loaded in production');
}
const db = openDatabase();
try {
  migrate(db);
  console.log('Synthetic users inserted:', seed(db));
} finally {
  db.close();
}

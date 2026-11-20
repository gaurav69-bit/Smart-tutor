import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));

export function openDatabase(file = process.env.DATABASE_FILE || './data/smarttutor.sqlite') {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  return db;
}

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const files = readdirSync(migrationDirectory).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  const applied = [];
  for (const name of files) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name)) continue;
    const sql = readFileSync(resolve(migrationDirectory, name), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    })();
    applied.push(name);
  }
  return applied;
}

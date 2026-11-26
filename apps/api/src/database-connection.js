import knex from 'knex';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDatabaseConfig } from './database-config.js';

export function createDatabaseConnection(env = process.env) {
  const config = getDatabaseConfig(env);
  if (config.client === 'better-sqlite3' && config.connection.filename !== ':memory:') {
    mkdirSync(dirname(config.connection.filename), { recursive: true });
  }
  return knex(config);
}
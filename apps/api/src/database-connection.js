import knex from 'knex';
import { getDatabaseConfig } from './database-config.js';

export function createDatabaseConnection(env = process.env) {
  const config = getDatabaseConfig(env);
  return knex(config);
}
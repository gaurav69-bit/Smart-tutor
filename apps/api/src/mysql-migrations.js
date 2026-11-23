// Versioned Knex migrations shared by MySQL and test-only SQLite connections.
// Existing tables are never removed or overwritten during an upgrade.
const migrations = [
  {
    name: '001_initial_schema',
    tables: ['users'],
    async up(db) {
      await db.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.string('name', 100).notNullable();
        table.string('email', 255).notNullable().unique();
        table.string('role', 20).notNullable();
        table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
        table.index('role');
      });
    }
  },
  {
    name: '002_account_identity_and_outbox',
    tables: ['account_profiles', 'account_secrets', 'email_verifications', 'sessions', 'auth_tokens', 'email_outbox'],
    async up(db) {
      await db.schema.createTable('account_profiles', (table) => {
        table.integer('user_id').unsigned().primary().references('id').inTable('users').onDelete('CASCADE');
        table.text('bio').nullable();
        table.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
      });
      await db.schema.createTable('account_secrets', (table) => {
        table.integer('user_id').unsigned().primary().references('id').inTable('users').onDelete('CASCADE');
        table.string('password_hash', 255).notNullable();
        table.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
      });
      await db.schema.createTable('email_verifications', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('token_hash', 64).notNullable().unique();
        table.timestamp('expires_at').notNullable();
        table.timestamp('used_at').nullable();
        table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
        table.index('user_id');
      });
      await db.schema.createTable('sessions', (table) => {
        table.string('id', 64).primary();
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.timestamp('expires_at').notNullable();
        table.timestamp('revoked_at').nullable();
        table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
        table.index('user_id');
      });
      await db.schema.createTable('auth_tokens', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('purpose', 40).notNullable();
        table.string('token_hash', 64).notNullable().unique();
        table.timestamp('expires_at').notNullable();
        table.timestamp('used_at').nullable();
        table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
        table.index(['user_id', 'purpose']);
      });
      await db.schema.createTable('email_outbox', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
        table.string('recipient', 255).notNullable();
        table.string('subject', 255).notNullable();
        table.text('body').notNullable();
        table.string('status', 20).notNullable().defaultTo('pending');
        table.integer('attempts').unsigned().notNullable().defaultTo(0);
        table.timestamp('sent_at').nullable();
        table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
        table.index(['status', 'created_at']);
      });
    }
  }
];

export async function migrateMySQL(db) {
  // A tracked migration is only considered finished after its schema is present.
  if (!(await db.schema.hasTable('schema_migrations'))) {
    await db.schema.createTable('schema_migrations', (table) => {
      table.string('name', 255).primary();
      table.timestamp('applied_at').notNullable().defaultTo(db.fn.now());
    });
  }

  const applied = [];
  for (const migration of migrations) {
    const record = await db('schema_migrations').where({ name: migration.name }).first();
    const existing = [];
    for (const table of migration.tables) {
      if (await db.schema.hasTable(table)) existing.push(table);
    }
    if (record) {
      if (existing.length !== migration.tables.length) {
        throw new Error('Migration recorded but expected tables are missing: ' + migration.name);
      }
      continue;
    }
    // Do not adopt or overwrite tables that the migration did not create.
    if (existing.length) {
      throw new Error('Migration ' + migration.name + ' has existing untracked tables: ' + existing.join(', '));
    }
    await migration.up(db);
    await db('schema_migrations').insert({ name: migration.name });
    applied.push(migration.name);
  }
  return applied;
}

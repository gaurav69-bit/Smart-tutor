export async function migrateMySQL(db) {
  const migrationName = '001_initial_schema';

  // Create a table to track completed migrations.
  const trackingExists =
    await db.schema.hasTable('schema_migrations');

  if (!trackingExists) {
    await db.schema.createTable('schema_migrations', (table) => {
      table.string('name', 255).primary();
      table.timestamp('applied_at')
        .notNullable()
        .defaultTo(db.fn.now());
    });
  }

  // Check whether the migration was already completed.
  const recorded = await db('schema_migrations')
    .where({ name: migrationName })
    .first();

  const usersExists = await db.schema.hasTable('users');

  if (recorded) {
    if (!usersExists) {
      throw new Error(
        'Migration recorded, but users table is missing.'
      );
    }

    return [];
  }

  // Never overwrite an existing untracked users table.
  if (usersExists) {
    throw new Error(
      'Users table already exists without a migration record.'
    );
  }

  // Create the initial users table.
  await db.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('role', 20).notNullable();

    table.timestamp('created_at')
      .notNullable()
      .defaultTo(db.fn.now());

    table.index('role');
  });

  // Record the successful migration.
  await db('schema_migrations').insert({
    name: migrationName
  });

  return [migrationName];
}
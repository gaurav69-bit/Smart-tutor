export function getDatabaseConfig(env = process.env) {
  const client = (env.DB_CLIENT || 'sqlite3').toLowerCase();

  if (client === 'mysql2') {
    return {
      client: 'mysql2',
      connection: {
        host: env.DB_HOST,
        port: Number(env.DB_PORT || 3306),
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        ssl: env.DB_SSL === 'false'
          ? undefined
          : env.DB_SSL_CA
            ? {
                ca: env.DB_SSL_CA.replace(/\\n/g, '\n'),
                rejectUnauthorized: true,
                verifyIdentity: true,
              }
            : { rejectUnauthorized: true, verifyIdentity: true },
      },
      pool: { min: 0, max: 10 },
    };
  }

  if (client !== 'sqlite3') {
    throw new Error(`Unsupported DB_CLIENT: ${client}`);
  }

  return {
    client: 'better-sqlite3',
    connection: {
      filename: env.DATABASE_FILE || './data/smarttutor.sqlite',
    },
    useNullAsDefault: true,
  };
}
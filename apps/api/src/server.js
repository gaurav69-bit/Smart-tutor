import 'dotenv/config';

import { createApp } from './app.js';
import { migrate, openDatabase } from './db.js';
import { createDatabaseConnection } from './database-connection.js';

const port = Number(process.env.PORT || 3001);

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}

const client = (process.env.DB_CLIENT || 'sqlite3').toLowerCase();
const useMySQL = client === 'mysql2';

if (!['sqlite3', 'mysql2'].includes(client)) {
  throw new Error(`Unsupported DB_CLIENT: ${client}`);
}

async function startServer() {
  const db = useMySQL
    ? createDatabaseConnection(process.env)
    : openDatabase();

  async function closeDatabase() {
    if (useMySQL) {
      await db.destroy();
    } else {
      db.close();
    }
  }

  try {
    if (useMySQL) {
      // Check the MySQL connection before starting the server.
      await db.raw('SELECT 1 AS ok');
      console.log('MySQL database connection ready');

      // MySQL migrations are deliberately not run automatically.
      // They must be reviewed and tested separately.
    } else {
      const applied = migrate(db);
      console.log(
        'SQLite database ready; migrations applied:',
        applied.length
      );
    }

    const server = createApp(db).listen(port, () => {
      console.log(
        'SmartTutor backend listening on port ' +
        server.address().port
      );
    });

    let shuttingDown = false;

    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;

      server.close(async () => {
        try {
          await closeDatabase();
          process.exit(0);
        } catch (error) {
          console.error('Shutdown error:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    await closeDatabase();
    throw error;
  }
}

startServer().catch((error) => {
  console.error('Backend startup failed:', error.message);
  process.exitCode = 1;
});
import 'dotenv/config';
import { createApp } from './app.js';
import { migrate, openDatabase } from './db.js';

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}
const db = openDatabase();
try {
  const applied = migrate(db);
  console.log('Database ready; migrations applied:', applied.length);
  const server = createApp(db).listen(port, () => {
    console.log('SmartTutor backend listening on port ' + server.address().port);
  });
  const shutdown = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  db.close();
  throw error;
}

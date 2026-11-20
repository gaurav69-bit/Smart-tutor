import { createApp } from '../apps/api/src/app.js';
import { migrate, openDatabase } from '../apps/api/src/db.js';

// Week 3 serves health and format-validation routes only. No accounts are stored.
// Persistent production account storage is a separate database integration.
const db = openDatabase(':memory:');
migrate(db);
const app = createApp(db);

export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.searchParams.get('__route');
  if (path !== null) {
    url.searchParams.delete('__route');
    const query = url.searchParams.toString();
    req.url = '/api/' + path.replace(/^\/+/, '') + (query ? '?' + query : '');
  }
  return app(req, res);
}

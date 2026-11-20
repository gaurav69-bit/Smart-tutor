-- ST-15: minimal account data foundation only; authentication and account routes are separate team responsibilities.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

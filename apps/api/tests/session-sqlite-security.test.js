import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';
import { hashSessionToken } from '../src/auth/session-token.js';

// Test-only schema/adapters. ST-106 owns production persistence; this fixture
// proves HTTP -> actual SQLite state transitions without modifying production schema.
test('ST-72: SQLite fixture login -> authenticated access -> logout -> revoked access', async (t) => {
  const db = openDatabase(':memory:');
  migrate(db);
  db.exec(`
    CREATE TABLE security_test_accounts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      role TEXT NOT NULL,
      verified INTEGER NOT NULL,
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE security_test_sessions (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      FOREIGN KEY(account_id) REFERENCES security_test_accounts(id)
    );
  `);
  const password = 'StrongTestOnlyPassword123';
  const salt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(password, salt, 64).toString('hex');
  db.prepare(`INSERT INTO security_test_accounts
    (id, name, email, role, verified, salt, password_hash)
    VALUES (1, 'Example Student', 'student@example.test', 'student', 1, ?, ?)`)
    .run(salt, passwordHash);

  const authenticatePassword = (email, submittedPassword) => {
    const row = db.prepare('SELECT * FROM security_test_accounts WHERE email = ?').get(email);
    if (!row) return null;
    const candidate = scryptSync(submittedPassword, row.salt, 64);
    const expected = Buffer.from(row.password_hash, 'hex');
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null;
    return { id: row.id, name: row.name, email: row.email, role: row.role,
      verified: row.verified === 1 };
  };
  const persistSession = ({ accountId, tokenHash, expiresAt }) => {
    db.prepare('INSERT INTO security_test_sessions (account_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(accountId, tokenHash, expiresAt);
    return true;
  };
  const lookupSession = (tokenHash) => {
    const row = db.prepare(`SELECT s.expires_at, s.revoked_at,
      a.id, a.name, a.email, a.role, a.verified
      FROM security_test_sessions s JOIN security_test_accounts a ON a.id = s.account_id
      WHERE s.token_hash = ?`).get(tokenHash);
    if (!row) return null;
    return { expiresAt: row.expires_at, revokedAt: row.revoked_at,
      account: { id: row.id, name: row.name, email: row.email,
        role: row.role, verified: row.verified === 1 } };
  };
  const revokeSession = (tokenHash) => {
    db.prepare('UPDATE security_test_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(Date.now(), tokenHash);
    return true;
  };

  const server = createApp(db, { authenticatePassword, persistSession, lookupSession, revokeSession }).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (email, pass) => fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  const getMe = (cookie) => fetch(base + '/api/auth/me', { headers: { cookie } });
  const logout = (cookie) => fetch(base + '/api/auth/logout', {
    method: 'POST', headers: { cookie }
  });

  for (const [email, pass] of [
    ['student@example.test', 'wrong'],
    ['unknown@example.test', password]
  ]) {
    const rejected = await login(email, pass);
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json()).error.code, 'INVALID_CREDENTIALS');
    assert.equal(rejected.headers.get('set-cookie'), null);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM security_test_sessions').get().count, 0);

  const response = await login('STUDENT@EXAMPLE.TEST', password);
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const rawToken = cookie.split('=')[1];
  assert.match(rawToken, /^[a-f0-9]{64}$/);
  const stored = db.prepare('SELECT * FROM security_test_sessions').get();
  assert.equal(stored.token_hash, hashSessionToken(rawToken));
  assert.equal(JSON.stringify(await response.json()).includes(password), false);
  assert.equal(db.prepare('SELECT password_hash FROM security_test_accounts').get().password_hash.includes(password), false);

  const beforeLogout = await getMe(cookie);
  assert.equal(beforeLogout.status, 200);
  assert.equal((await beforeLogout.json()).account.email, 'student@example.test');

  const loggedOut = await logout(cookie);
  assert.equal(loggedOut.status, 204);
  assert.notEqual(db.prepare('SELECT revoked_at FROM security_test_sessions WHERE id = ?').get(stored.id).revoked_at, null);

  const afterLogout = await getMe(cookie);
  assert.equal(afterLogout.status, 401);

  const secondLogin = await login('student@example.test', password);
  assert.equal(secondLogin.status, 200);
  const secondCookie = secondLogin.headers.get('set-cookie').split(';')[0];
  db.prepare('UPDATE security_test_sessions SET expires_at = ? WHERE token_hash = ?')
    .run(Date.now() - 1, hashSessionToken(secondCookie.split('=')[1]));
  assert.equal((await getMe(secondCookie)).status, 401);

  db.prepare('UPDATE security_test_accounts SET verified = 0 WHERE id = 1').run();
  assert.equal((await login('student@example.test', password)).status, 401);
  assert.equal((await getMe(secondCookie)).status, 401);
});

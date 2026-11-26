import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { openDatabase, migrate } from '../src/db.js';
import { verifyPassword } from '../src/auth/password.js';

// Test-only persistence fixture. This DOES NOT modify Shuvo's production schema.
// It exercises the actual Express registration handler against SQLite rather than mocks.
test('ST-69: HTTP registration persists student and tutor safely in a SQLite test fixture', async (t) => {
  const db = openDatabase(':memory:');
  migrate(db);
  db.exec(`
    CREATE TABLE registration_test_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('student','tutor')),
      password_hash TEXT NOT NULL,
      subject TEXT NOT NULL,
      accepted_terms INTEGER NOT NULL CHECK (accepted_terms = 1)
    )
  `);

  const validateProfileAndConsent = (body) => {
    const errors = {};
    if (body.acceptedTerms !== true) errors.acceptedTerms = 'Consent required';
    if (typeof body.subject !== 'string' || !body.subject.trim()) errors.subject = 'Subject required';
    if (Object.keys(errors).length) return { valid: false, errors };
    return { valid: true, profile: { subject: body.subject.trim(), acceptedTerms: true } };
  };

  const registerAccount = (account, profile) => {
    try {
      const result = db.prepare(`
        INSERT INTO registration_test_accounts
          (name,email,role,password_hash,subject,accepted_terms)
        VALUES (?,?,?,?,?,?)
      `).run(account.name, account.email, account.role, account.passwordHash, profile.subject, Number(profile.acceptedTerms));
      return { id: result.lastInsertRowid, name: account.name, email: account.email, role: account.role };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const duplicate = new Error('Duplicate email');
        duplicate.code = 'DUPLICATE_EMAIL';
        throw duplicate;
      }
      throw error;
    }
  };

  const server = createApp(db, { registerAccount, validateProfileAndConsent }).listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/api/auth/register`;
  const post = (body) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const password = 'TestOnlyStrongPassword123';
  const makeBody = (role, email) => ({
    name: ' Example User ', email, role, password,
    subject: 'Mathematics', acceptedTerms: true
  });

  for (const role of ['student', 'tutor']) {
    const response = await post(makeBody(role, `${role}@example.test`));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.account.role, role);
    assert.equal(body.account.verified, false);
    assert.equal(JSON.stringify(body).includes(password), false);
    assert.equal(Object.hasOwn(body.account, 'passwordHash'), false);

    const saved = db.prepare('SELECT * FROM registration_test_accounts WHERE email = ?').get(`${role}@example.test`);
    assert.equal(saved.role, role);
    assert.equal(saved.password_hash.startsWith('scrypt:'), true);
    assert.equal(saved.password_hash.includes(password), false);
    assert.equal(await verifyPassword(password, saved.password_hash), true);
    assert.equal(saved.accepted_terms, 1);
  }

  const duplicate = await post(makeBody('student', 'STUDENT@EXAMPLE.TEST'));
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, 'DUPLICATE_EMAIL');

  const missingConsent = await post({ ...makeBody('student', 'third@example.test'), acceptedTerms: false });
  assert.equal(missingConsent.status, 400);
  assert.equal((await missingConsent.json()).error.details.acceptedTerms, 'Consent required');

  const admin = await post(makeBody('admin', 'fourth@example.test'));
  assert.equal(admin.status, 400);
  assert.equal((await admin.json()).error.code, 'VALIDATION_ERROR');

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM registration_test_accounts').get().count, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
});

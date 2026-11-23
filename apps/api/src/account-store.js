// Persistence layer only. HTTP authentication and email delivery are owned by
// the relevant integration work; never store raw passwords or raw tokens.
import { createHash } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest('hex');

function nonempty(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(field + ' is required');
  return value.trim();
}
function normalizedEmail(value) {
  return nonempty(value, 'email').toLowerCase();
}
function validRole(role) {
  if (!['student', 'tutor'].includes(role)) throw new TypeError('Invalid account role');
  return role;
}

// Accept a pre-hashed password from an authentication service, never raw passwords.
// The caller must use an appropriate slow password hashing algorithm (e.g. Argon2id).
export async function createAccount(db, { name, email, role, passwordHash, bio = null }) {
  name = nonempty(name, 'name');
  email = normalizedEmail(email);
  validRole(role);
  passwordHash = nonempty(passwordHash, 'passwordHash');
  if (name.length > 100 || email.length > 255 || passwordHash.length > 255) {
    throw new RangeError('Account field exceeds database limit');
  }
  return db.transaction(async (trx) => {
    const [userId] = await trx('users').insert({ name, email, role });
    await trx('account_secrets').insert({ user_id: userId, password_hash: passwordHash });
    await trx('account_profiles').insert({ user_id: userId, bio });
    return { id: userId, name, email, role };
  });
}

export async function findAccountByEmail(db, email) {
  const user = await db('users')
    .leftJoin('account_profiles', 'users.id', 'account_profiles.user_id')
    .select('users.id', 'users.name', 'users.email', 'users.role', 'account_profiles.bio')
    .where('users.email', normalizedEmail(email)).first();
  return user || null;
}

// Credentials are deliberately returned only by this explicit, separate function.
export async function findAccountCredentials(db, email) {
  const row = await db('users')
    .join('account_secrets', 'users.id', 'account_secrets.user_id')
    .select('users.id', 'users.email', 'users.role', 'account_secrets.password_hash')
    .where('users.email', normalizedEmail(email)).first();
  return row || null;
}

export async function updateAccountProfile(db, userId, { bio }) {
  const changed = await db('account_profiles').where({ user_id: userId })
    .update({ bio: bio ?? null, updated_at: db.fn.now() });
  return changed > 0;
}

// Store SHA-256 token fingerprints only. Generate unpredictable tokens in the auth layer.
export async function storeEmailVerification(db, { userId, token, expiresAt }) {
  return db('email_verifications').insert({
    user_id: userId, token_hash: digest(nonempty(token, 'token')), expires_at: expiresAt
  });
}

export async function storeAuthToken(db, { userId, purpose, token, expiresAt }) {
  return db('auth_tokens').insert({
    user_id: userId, purpose: nonempty(purpose, 'purpose'),
    token_hash: digest(nonempty(token, 'token')), expires_at: expiresAt
  });
}

export async function createSession(db, { id, userId, expiresAt }) {
  return db('sessions').insert({ id: nonempty(id, 'id'), user_id: userId, expires_at: expiresAt });
}

export async function enqueueEmail(db, { userId = null, recipient, subject, body }) {
  const [id] = await db('email_outbox').insert({
    user_id: userId, recipient: normalizedEmail(recipient),
    subject: nonempty(subject, 'subject'), body: nonempty(body, 'body')
  });
  return id;
}

export async function getPendingEmails(db, limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Invalid email batch size');
  return db('email_outbox').where({ status: 'pending' }).orderBy('id').limit(limit);
}

export async function markEmailSent(db, id) {
  return db('email_outbox').where({ id, status: 'pending' })
    .update({ status: 'sent', sent_at: db.fn.now() });
}

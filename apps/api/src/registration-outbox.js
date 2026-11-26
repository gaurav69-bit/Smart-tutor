// Approval Pending — ST-106 isolated, transactional registration handoff.
//
// This function does not expose an HTTP endpoint or send email. The auth
// boundary remains responsible for role/profile validation, password hashing,
// issuing a cryptographically random token and rendering an approved link.
// Register + verification challenge + queued message either ALL commit or NONE.
import { createHash } from 'node:crypto';
import { saveRegistrationDetails } from './registration-details.js';

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const duplicate = (error) => ['ER_DUP_ENTRY', 'SQLITE_CONSTRAINT_UNIQUE',
  'SQLITE_CONSTRAINT_PRIMARYKEY'].includes(error?.code) || error?.errno === 1062;

function text(value, key, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new TypeError('Invalid ' + key);
  }
  return value.trim();
}

export async function registerWithVerificationOutbox(db, {
  account, validatedProfile = {}, token, expiresAt, message
} = {}) {
  if (!db || typeof db.transaction !== 'function') throw new TypeError('Knex database required');
  if (!account || typeof account !== 'object' || Array.isArray(account)) {
    throw new TypeError('Validated account required');
  }
  if (validatedProfile == null || typeof validatedProfile !== 'object' ||
      Array.isArray(validatedProfile)) throw new TypeError('Validated profile required');

  const name = text(account.name, 'name', 100);
  const email = text(account.email, 'email', 255).toLowerCase();
  // Email validation is also required at the HTTP boundary.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError('Invalid email');
  const role = account.role;
  if (!['student', 'tutor'].includes(role)) throw new TypeError('Invalid role');
  const passwordHash = text(account.passwordHash, 'password hash', 255);
  // Avoid arbitrary request fields; only the already supported bio is stored.
  const bio = typeof validatedProfile.bio === 'string' ? validatedProfile.bio : null;
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new TypeError('Verification token must be 32 random bytes in lowercase hex');
  }
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) {
    throw new TypeError('Future verification expiry required');
  }
  if (!message || typeof message !== 'object') throw new TypeError('Message required');
  const subject = text(message.subject, 'email subject', 255);
  const body = text(message.body, 'email body', 100000);
  const fingerprint = createHash('sha256').update(token).digest('hex');

  try {
    return await db.transaction(async (trx) => {
      // No live account or partial token can survive a failure below.
      const [id] = await trx('users').insert({ name, email, role });
      await trx('account_secrets').insert({ user_id: id, password_hash: passwordHash });
      await trx('account_profiles').insert({ user_id: id, bio });
      if (validatedProfile.terms === true) {
        await saveRegistrationDetails(trx, id, role, validatedProfile);
      }
      await trx('email_verifications').insert({
        user_id: id,
        token_hash: fingerprint,
        expires_at: expiry,
        // Match resend's explicit Date so SQLite sorts both issue timestamps the same way.
        created_at: new Date()
      });
      await trx('email_outbox').insert({
        user_id: id, recipient: email, subject, body
      });
      return { id, name, email, role };
    });
  } catch (error) {
    if (duplicate(error)) {
      const conflict = new Error('Email already registered');
      conflict.code = /username/i.test(error.message || '') ? 'DUPLICATE_USERNAME' : 'DUPLICATE_EMAIL';
      throw conflict;
    }
    throw error;
  }
}

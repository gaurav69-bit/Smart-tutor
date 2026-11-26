// Proposed ST-106 storage adapters for Jahid's Week 4 authentication handlers.
// These functions are NOT wired into Express until the team confirms the
// registration profile/consent, approval, verification email and cookie policies.
import { createAccount } from './account-store.js';

const asDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new TypeError('Invalid expiry date');
  return date;
};
const millis = (value) => value == null ? null : new Date(value).getTime();
const normalized = (value) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('Email is required');
  return value.trim().toLowerCase();
};
const isDuplicate = (error) => ['ER_DUP_ENTRY', 'SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY']
  .includes(error?.code) || error?.errno === 1062;

function safeAccount(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, email: row.email, role: row.role,
    verified: row.email_verified_at != null
  };
}

export function createAuthPersistenceAdapters(db, { verifyPassword } = {}) {
  if (!db || typeof db.transaction !== 'function') throw new TypeError('Knex database required');
  return {
    // The HTTP handler must validate role-specific consent/profile first.
    async registerAccount(account, validatedProfile = {}) {
      if (validatedProfile == null || typeof validatedProfile !== 'object' ||
          Array.isArray(validatedProfile)) throw new TypeError('Validated profile required');
      try {
        // Validation is an explicit responsibility of the HTTP boundary.
        // Store only an approved profile field, not arbitrary request keys.
        return await createAccount(db, {
          name: account.name,
          email: account.email,
          role: account.role,
          passwordHash: account.passwordHash,
          bio: typeof validatedProfile.bio === 'string' ? validatedProfile.bio : null
        });
      } catch (error) {
        if (isDuplicate(error)) {
          const duplicate = new Error('Email already registered');
          duplicate.code = 'DUPLICATE_EMAIL';
          throw duplicate;
        }
        throw error;
      }
    },

    // Consume token exactly once, with an expiry check and verification change
    // within one transaction. No raw token enters the database adapter.
    async consumeVerificationToken(tokenHash) {
      if (typeof tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(tokenHash)) return false;
      return db.transaction(async (trx) => {
        const record = await trx('email_verifications')
          .where({ token_hash: tokenHash }).forUpdate().first();
        if (!record || record.used_at != null ||
            millis(record.expires_at) <= Date.now()) return false;
        const consumed = await trx('email_verifications')
          .where({ id: record.id, used_at: null })
          .update({ used_at: trx.fn.now() });
        if (consumed !== 1) return false;
        const verified = await trx('users').where({ id: record.user_id })
          .update({ email_verified_at: trx.fn.now() });
        return verified === 1;
      });
    },

    // Password verification uses Jahid's algorithm supplied by its owner.
    // Do not return password hashes, and never authenticate unverified accounts.
    async authenticatePassword(email, password) {
      if (typeof verifyPassword !== 'function') {
        throw new Error('Password verification adapter not configured');
      }
      if (typeof password !== 'string') return null;
      const row = await db('users')
        .join('account_secrets', 'users.id', 'account_secrets.user_id')
        .select('users.id', 'users.name', 'users.email', 'users.role',
          'users.email_verified_at', 'users.approval_status', 'account_secrets.password_hash')
        .where('users.email', normalized(email)).first();
      if (!row || row.email_verified_at == null || row.approval_status !== 'approved') return null;
      if (!await verifyPassword(password, row.password_hash)) return null;
      return safeAccount(row);
    },

    // Jahid passes an already-hashed opaque session token (not a cookie value).
    async persistSession({ accountId, tokenHash, expiresAt }) {
      if (typeof tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(tokenHash)) return false;
      const expiry = asDate(expiresAt);
      if (expiry.valueOf() <= Date.now()) return false;
      try {
        await db.transaction(async (trx) => {
          const user = await trx('users').where({ id: accountId })
            .select('id', 'email_verified_at', 'approval_status').first();
          if (!user || user.email_verified_at == null || user.approval_status !== 'approved') {
            throw new Error('Account not eligible for a session');
          }
          await trx('sessions').insert({
            id: tokenHash, user_id: accountId, expires_at: expiry
          });
        });
        return true;
      } catch (error) {
        if (error?.message === 'Account not eligible for a session' || isDuplicate(error)) return false;
        throw error;
      }
    },

    async lookupSession(tokenHash) {
      if (typeof tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(tokenHash)) return null;
      const row = await db('sessions')
        .join('users', 'users.id', 'sessions.user_id')
        .select('sessions.expires_at', 'sessions.revoked_at',
          'users.id', 'users.name', 'users.email', 'users.role',
          'users.email_verified_at', 'users.approval_status')
        .where('sessions.id', tokenHash).first();
      if (!row) return null;
      return {
        expiresAt: millis(row.expires_at),
        revokedAt: millis(row.revoked_at),
        account: row.approval_status === 'approved' ? safeAccount(row) : null
      };
    },

    async revokeSession(tokenHash) {
      if (typeof tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(tokenHash)) return false;
      const count = await db('sessions').where({ id: tokenHash, revoked_at: null })
        .update({ revoked_at: db.fn.now() });
      return count === 1;
    }
  };
}

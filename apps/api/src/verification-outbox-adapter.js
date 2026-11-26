// Approval Pending — ST-106 verification resend persistence adapter.
//
// This module implements only the proposed durable database handoff. It is not
// wired into Express or a real mail provider. Token/URL templates, expiry,
// cooldown, sender, and delivery must be explicitly agreed and injected.
import { createHash } from 'node:crypto';

const tokenPattern = /^[a-f0-9]{64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createVerificationResendAdapter(db, {
  createToken, renderVerificationEmail, tokenTtlMs, cooldownMs,
  now = Date.now
} = {}) {
  if (!db || typeof db.transaction !== 'function') throw new TypeError('Knex database required');
  if (typeof createToken !== 'function' || typeof renderVerificationEmail !== 'function') {
    throw new TypeError('Approved token and email builder functions required');
  }
  if (![tokenTtlMs, cooldownMs].every(v => Number.isSafeInteger(v) && v > 0)) {
    throw new TypeError('Approved verification expiry and cooldown required');
  }
  if (typeof now !== 'function') throw new TypeError('Clock required');

  return async function queueVerificationResend(email) {
    // Only the HTTP boundary reports status. Both eligible and unknown or
    // already verified accounts return undefined so callers can send the same
    // generic 202 response and avoid account enumeration.
    if (typeof email !== 'string' || email.length > 200 || !emailPattern.test(email)) {
      throw new TypeError('Valid email required');
    }
    const normalizedEmail = email.trim().toLowerCase();
    await db.transaction(async (trx) => {
      // A user-row lock serializes eligibility and resend decisions on MySQL.
      // SQLite ignores FOR UPDATE; production concurrency must be proven on
      // the configured hosted database before this adapter is deployed.
      const user = await trx('users').where({ email: normalizedEmail })
        .forUpdate().first('id', 'email_verified_at');
      if (!user || user.email_verified_at != null) return;

      const timestamp = now();
      if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
        throw new TypeError('Clock must return epoch milliseconds');
      }
      const last = await trx('email_verifications')
        .where({ user_id: user.id }).orderBy('created_at', 'desc')
        .orderBy('id', 'desc').first('created_at');
      if (last && timestamp - new Date(last.created_at).getTime() < cooldownMs) return;

      const rawToken = await createToken();
      if (typeof rawToken !== 'string' || !tokenPattern.test(rawToken)) {
        throw new TypeError('Token generator must produce 32 random bytes as lowercase hex');
      }
      const message = await renderVerificationEmail({
        email: normalizedEmail, token: rawToken, expiresAt: timestamp + tokenTtlMs
      });
      if (!message || typeof message.subject !== 'string' ||
          !message.subject.trim() || message.subject.length > 255 ||
          typeof message.body !== 'string' || !message.body.trim()) {
        throw new TypeError('Verification email builder returned invalid message');
      }
      // Token digest and durable outbox row commit together. Failed builders
      // or failed inserts roll back the complete transaction.
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await trx('email_verifications').insert({
        user_id: user.id, token_hash: tokenHash,
        expires_at: new Date(timestamp + tokenTtlMs),
        created_at: new Date(timestamp)
      });
      await trx('email_outbox').insert({
        user_id: user.id, recipient: normalizedEmail,
        subject: message.subject, body: message.body
      });
    });
  };
}

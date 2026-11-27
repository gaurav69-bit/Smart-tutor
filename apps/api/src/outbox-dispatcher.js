// ST-106: explicitly invoked outbox dispatcher, independent of any provider.
// Never start automatically. The deployment owner must configure an approved
// transport, sender and retry policy before enabling live email delivery.
//
// Atomic "pending" -> "sending" claims prevent two concurrent dispatchers from
// submitting the same row. An interrupted send remains in "sending" for manual
// reconciliation; do NOT auto-requeue it (delivery may already have happened).
export async function processPendingOutbox(db, {
  send,
  limit = 10,
  recipient,
  outboxId
} = {}) {
  if (!db || typeof db.transaction !== 'function') throw new TypeError('Knex database required');
  if (typeof send !== 'function') throw new TypeError('An explicit mail transport is required');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Invalid outbox batch size');
  }

  const query = db('email_outbox');
  if (outboxId !== undefined) {
    if (!Number.isSafeInteger(outboxId) || outboxId < 1) {
      throw new TypeError('Invalid outbox ID');
    }
    query.where({ id: outboxId });
  }
  if (recipient !== undefined) {
    if (typeof recipient !== 'string' || !recipient.trim()) throw new TypeError('Invalid recipient');
    query.where({ recipient: recipient.trim().toLowerCase() });
  }
  const pending = await query
    .where({ status: 'pending' }).orderBy('id').limit(limit).select(
      'id', 'recipient', 'subject', 'body'
    );
  const result = { considered: pending.length, claimed: 0, sent: 0, failed: 0 };

  for (const message of pending) {
    // One database statement is the cross-process claim, not an in-memory lock.
    const claimed = await db('email_outbox').where({
      id: message.id, status: 'pending'
    }).update({ status: 'sending' });
    if (claimed !== 1) continue;
    result.claimed++;

    let delivery;
    try {
      delivery = await send({
        to: message.recipient,
        subject: message.subject,
        textContent: message.body
      });
      // Provider must explicitly acknowledge acceptance, never infer success
      // from an undefined / false return value.
      if (!delivery || typeof delivery.messageId !== 'string' ||
          !delivery.messageId.trim()) throw new Error('Transport did not acknowledge acceptance');
    } catch {
      // Never persist provider exceptions: they may contain API keys or tokens.
      await completeClaim(db, message.id, false, null);
      result.failed++;
      continue;
    }
    await completeClaim(db, message.id, true, delivery.messageId.trim().slice(0, 255));
    result.sent++;
  }
  return result;
}

async function completeClaim(db, outboxId, accepted, providerMessageId) {
  await db.transaction(async (trx) => {
    const changed = await trx('email_outbox')
      .where({ id: outboxId, status: 'sending' })
      .update({
        status: accepted ? 'sent' : 'pending',
        sent_at: accepted ? trx.fn.now() : null,
        attempts: trx.raw('attempts + 1')
      });
    if (changed !== 1) throw new Error('Outbox claim lost; manual reconciliation required');
    await trx('email_delivery_attempts').insert({
      email_outbox_id: outboxId,
      outcome: accepted ? 'sent' : 'failed',
      provider_message_id: accepted ? providerMessageId : null,
      error_summary: accepted ? null : 'Transport failed'
    });
  });
}

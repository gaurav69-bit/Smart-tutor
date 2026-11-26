import test from 'node:test';
import assert from 'node:assert/strict';
import knex from 'knex';
import { migrateMySQL } from '../src/mysql-migrations.js';
import { enqueueEmail } from '../src/account-store.js';
import { processPendingOutbox } from '../src/outbox-dispatcher.js';

const database = () => knex({
  client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true
});

test('ST-106: opt-in dispatcher sends only claimed rows and persists a safe audit', async () => {
  const db = database();
  try {
    await migrateMySQL(db);
    const id = await enqueueEmail(db, {
      recipient: 'STUDENT@example.test', subject: 'Synthetic only', body: 'Synthetic email body'
    });
    const messages = [];
    const stats = await processPendingOutbox(db, {
      send: async (message) => {
        messages.push(message);
        return { messageId: 'synthetic-provider-123' };
      }
    });
    assert.deepEqual(stats, { considered: 1, claimed: 1, sent: 1, failed: 0 });
    assert.deepEqual(messages, [{
      to: 'student@example.test', subject: 'Synthetic only',
      textContent: 'Synthetic email body'
    }]);
    assert.deepEqual(await processPendingOutbox(db, {
      send: async () => { throw new Error('Must not send again'); }
    }), { considered: 0, claimed: 0, sent: 0, failed: 0 });
    const row = await db('email_outbox').where({ id }).first();
    assert.equal(row.status, 'sent');
    assert.equal(row.attempts, 1);
    assert.ok(row.sent_at);
    const attempts = await db('email_delivery_attempts').where({ email_outbox_id: id });
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].outcome, 'sent');
    assert.equal(attempts[0].provider_message_id, 'synthetic-provider-123');
  } finally { await db.destroy(); }
});

test('ST-106: transport failure never leaks error text; remains pending for explicit retry', async () => {
  const db = database();
  try {
    await migrateMySQL(db);
    const id = await enqueueEmail(db, {
      recipient: 'example@example.test', subject: 'Synthetic', body: 'Synthetic text'
    });
    const result = await processPendingOutbox(db, {
      send: async () => { throw new Error('SECRET-API-KEY-MUST-NOT-PERSIST'); }
    });
    assert.equal(result.failed, 1);
    let row = await db('email_outbox').where({ id }).first();
    assert.equal(row.status, 'pending');
    assert.equal(row.attempts, 1);
    const first = await db('email_delivery_attempts').where({ email_outbox_id: id }).first();
    assert.equal(first.outcome, 'failed');
    assert.equal(first.error_summary, 'Transport failed');
    assert.ok(!JSON.stringify(first).includes('SECRET-API-KEY'));
    await processPendingOutbox(db, {
      send: async () => ({ messageId: 'synthetic-id' })
    });
    row = await db('email_outbox').where({ id }).first();
    assert.equal(row.status, 'sent');
    assert.equal(row.attempts, 2);
    assert.deepEqual((await db('email_delivery_attempts').orderBy('id')).map(r => r.outcome), ['failed', 'sent']);
  } finally { await db.destroy(); }
});

test('ST-106: concurrent dispatchers cannot both claim the same outbox row', async () => {
  const db = database();
  try {
    await migrateMySQL(db);
    await enqueueEmail(db, {
      recipient: 'example@example.test', subject: 'Synthetic', body: 'Synthetic text'
    });
    let sent = 0;
    const send = async () => {
      sent++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return { messageId: 'synthetic-id' };
    };
    const [a, b] = await Promise.all([
      processPendingOutbox(db, { send }),
      processPendingOutbox(db, { send })
    ]);
    assert.equal(a.sent + b.sent, 1);
    assert.equal(sent, 1);
    assert.equal((await db('email_delivery_attempts').count({ n: '*' }).first()).n, 1);
  } finally { await db.destroy(); }
});

test('ST-106: a stranded sending state is NOT automatically requeued or double-sent', async () => {
  const db = database();
  try {
    await migrateMySQL(db);
    const id = await enqueueEmail(db, {
      recipient: 'example@example.test', subject: 'Synthetic', body: 'Synthetic text'
    });
    await db('email_outbox').where({ id }).update({ status: 'sending' });
    let invoked = false;
    const result = await processPendingOutbox(db, {
      send: async () => { invoked = true; return { messageId: 'not-sent' }; }
    });
    assert.equal(invoked, false);
    assert.equal(result.considered, 0);
    assert.equal((await db('email_outbox').where({ id }).first()).status, 'sending');
  } finally { await db.destroy(); }
});

test('ST-106: requires explicit sender and explicit safe batch size', async () => {
  const db = database();
  try {
    await migrateMySQL(db);
    await assert.rejects(processPendingOutbox(db), /explicit mail transport/);
    await assert.rejects(processPendingOutbox(db, { send: async () => true, limit: 0 }), /batch size/);
  } finally { await db.destroy(); }
});

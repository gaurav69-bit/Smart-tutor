import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBrevoMailTransport, createLocalMailCapture, verificationEmail, welcomeEmail
} from './account-mail.js';

const email = 'student@example.test';
const verificationUrl = 'https://smart-tutor.example.test/verify?token=sample&source=email';

test('verification and welcome messages can be captured locally', async () => {
  const capture = createLocalMailCapture();
  const verification = verificationEmail(email, verificationUrl);
  const welcome = welcomeEmail(email);
  assert.match(verification.textContent, /token=sample&source=email/);
  assert.match(verification.htmlContent, /token=sample&amp;source=email/);
  assert.match(welcome.textContent, /Your email is verified/);

  assert.deepEqual(await capture.send(verification), { messageId: 'local-1' });
  await capture.send(welcome);
  assert.deepEqual(capture.drain(), [
    { ...verification, messageId: 'local-1' },
    { ...welcome, messageId: 'local-2' }
  ]);
  assert.deepEqual(capture.drain(), []);
  assert.throws(() => verificationEmail(email, 'javascript:alert(1)'), /Invalid verification URL/);
  assert.throws(() => verificationEmail(email, 'http://example.test/verify'), /Invalid verification URL/);
  assert.doesNotThrow(() => verificationEmail(email, 'http://localhost:5173/verify?token=sample'));
});

test('Brevo transport sends the transactional email payload and returns its receipt', async () => {
  const mail = verificationEmail(email, verificationUrl);
  const send = createBrevoMailTransport({
    apiKey: 'test-only-key',
    senderEmail: 'no-reply@example.test',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['api-key'], 'test-only-key');
      assert.deepEqual(JSON.parse(options.body), {
        sender: { email: 'no-reply@example.test', name: 'SmartTutor' },
        to: [{ email }],
        subject: mail.subject,
        textContent: mail.textContent,
        htmlContent: mail.htmlContent
      });
      return Response.json({ messageId: 'provider-receipt' }, { status: 201 });
    }
  });

  assert.deepEqual(await send(mail), { messageId: 'provider-receipt' });
});

test('Brevo errors and missing receipts fail safely', async () => {
  for (const fetchImpl of [
    async () => new Response(verificationUrl, { status: 429 }),
    async () => Response.json({}, { status: 201 }),
    async () => { throw new Error(verificationUrl); }
  ]) {
    const send = createBrevoMailTransport({
      apiKey: 'test-only-key', senderEmail: 'no-reply@example.test', fetchImpl
    });
    await assert.rejects(send(welcomeEmail(email)), { message: 'Brevo email submission failed' });
  }
});

test('Brevo transport accepts text-only outbox messages and escapes the HTML fallback', async () => {
  let payload;
  const send = createBrevoMailTransport({
    apiKey: 'test-only-key',
    senderEmail: 'no-reply@example.test',
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return Response.json({ messageId: 'outbox-receipt' }, { status: 201 });
    }
  });
  const textContent = 'Line one\n<sample> & more';
  assert.deepEqual(await send({ to: email, subject: 'Welcome', textContent }), {
    messageId: 'outbox-receipt'
  });
  assert.equal(payload.textContent, textContent);
  assert.equal(payload.htmlContent, '<pre>Line one\n&lt;sample&gt; &amp; more</pre>');
});

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export function verificationEmail(email, verificationUrl) {
  const url = new URL(verificationUrl);
  const localHttp = url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password) {
    throw new TypeError('Invalid verification URL');
  }

  const link = url.href;
  const htmlLink = link.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return {
    to: email,
    subject: 'Verify your Smart Tutor email',
    textContent: `Verify your Smart Tutor email by opening this link:\n${link}\n\nIf you did not request this email, you can ignore it.`,
    htmlContent: `<p><a href="${htmlLink}">Verify your Smart Tutor email</a></p><p>If you did not request this email, you can ignore it.</p>`
  };
}

export function welcomeEmail(email) {
  const message = 'Your email is verified. You can now sign in to Smart Tutor.';
  return {
    to: email,
    subject: 'Welcome to Smart Tutor',
    textContent: message,
    htmlContent: `<p>${message}</p>`
  };
}

// The outbox worker can use the same send function with either transport.
export function createBrevoMailTransport({ apiKey, senderEmail, fetchImpl = fetch }) {
  if (!apiKey?.trim() || !senderEmail?.trim()) {
    throw new TypeError('Brevo API key and sender address are required');
  }

  return async ({ to, subject, textContent, htmlContent }) => {
    try {
      const response = await fetchImpl(BREVO_URL, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: 'Smart Tutor' },
          to: [{ email: to }],
          subject,
          textContent,
          htmlContent
        })
      });
      if (response.status === 201) {
        const { messageId } = await response.json();
        if (typeof messageId === 'string' && messageId.trim()) return { messageId };
      } else {
        await response.body?.cancel();
      }
    } catch {
      // Provider errors can contain recipient data or verification links.
    }
    throw new Error('Brevo email submission failed');
  };
}

// Process-local development capture. Keep captured verification links out of logs.
export function createLocalMailCapture() {
  const messages = [];
  let nextId = 1;
  return {
    async send(message) {
      const messageId = `local-${nextId++}`;
      messages.push({ ...message, messageId });
      return { messageId };
    },
    drain() {
      return messages.splice(0);
    }
  };
}

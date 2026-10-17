// SmtpMail delivers through the local Mailpit (Supabase local_smtp), read back over its API.
import { describe, expect, it } from 'vitest';
import { SmtpMail } from '../src/mail/smtp.mail';
import { env, sleep } from './helpers';

const MAILPIT = env.MAILPIT_URL ?? 'http://127.0.0.1:55424';

describe('SmtpMail (Mailpit)', () => {
  it('sends a message that arrives in the inbox', async () => {
    if (!env.SMTP_URL) throw new Error('SMTP_URL missing from .env: run npm run env');
    const to = `e2e-${crypto.randomUUID().slice(0, 8)}@example.com`;
    await new SmtpMail(env.SMTP_URL, 'Chalkroom <no-reply@chalkroom.local>').send({ to, subject: 'Your code', text: 'Code: 123456' });

    let found: { Subject: string; To: { Address: string }[] } | undefined;
    for (let i = 0; i < 20 && !found; i++) {
      const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
      found = ((await r.json()) as { messages?: (typeof found)[] }).messages?.[0];
      if (!found) await sleep(200);
    }
    expect(found?.Subject).toBe('Your code');
    expect(found?.To[0].Address).toBe(to);
  });
});

import { describe, it, expect } from 'vitest';
import { ConsoleMail } from '../src/mail/console.mail';
import { NoEmbeddings } from '../src/rag/embeddings/no.embeddings';

describe('ConsoleMail', () => {
  it('keeps sent mail in the outbox, capped', async () => {
    const lines: string[] = [];
    const mail = new ConsoleMail((l) => lines.push(l), 2);
    for (const n of [1, 2, 3]) await mail.send({ to: `u${n}@example.com`, subject: `s${n}`, text: 't' });
    expect(mail.outbox.map((m) => m.to)).toEqual(['u2@example.com', 'u3@example.com']);
    expect(lines).toEqual(['mail to u1@example.com: s1', 'mail to u2@example.com: s2', 'mail to u3@example.com: s3']);
  });
});

describe('NoEmbeddings', () => {
  it('returns one null per input so retrieval falls back to full text', async () => {
    expect(await new NoEmbeddings().embed(['a', 'b'], 'document')).toEqual([null, null]);
  });
});

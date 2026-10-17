// MailPort: the one door to email. Used by email 2FA codes (B11). Two adapters:
// SmtpMail (Mailpit locally, any SMTP provider in production) and ConsoleMail (logs, and keeps
// an outbox for tests). Choose with SMTP_URL; without it the API logs mail instead of sending.

export interface MailMessage {
  to: string;
  subject: string;
  /** plain text body (always sent) */
  text: string;
  html?: string;
}

export abstract class MailPort {
  abstract readonly name: string;
  /** Resolves once the message is accepted by the transport; rejects on a transport error. */
  abstract send(msg: MailMessage): Promise<void>;
}

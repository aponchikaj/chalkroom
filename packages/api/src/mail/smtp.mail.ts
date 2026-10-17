// Mail over SMTP. Locally SMTP_URL=smtp://127.0.0.1:55425 delivers to Mailpit
// (http://127.0.0.1:55424); in production use the provider's smtp(s):// URL.
import { createTransport, type Transporter } from 'nodemailer';
import { MailPort, type MailMessage } from './mail.port';

export class SmtpMail extends MailPort {
  readonly name = 'smtp';
  private transport: Transporter;

  constructor(url: string, private from: string) {
    super();
    this.transport = createTransport(url);
  }

  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  }
}

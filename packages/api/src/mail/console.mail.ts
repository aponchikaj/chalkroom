// Mail without a transport: logs each message and keeps the last ones in memory (tests read
// `outbox`). The default when SMTP_URL is not set.
import { MailPort, type MailMessage } from './mail.port';

export class ConsoleMail extends MailPort {
  readonly name = 'console';
  readonly outbox: MailMessage[] = [];

  constructor(private log: (line: string) => void = () => undefined, private keep = 50) {
    super();
  }

  async send(msg: MailMessage): Promise<void> {
    this.outbox.push(msg);
    if (this.outbox.length > this.keep) this.outbox.shift();
    this.log(`mail to ${msg.to}: ${msg.subject}`);
  }
}

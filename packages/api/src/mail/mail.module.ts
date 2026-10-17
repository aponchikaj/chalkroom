import { Global, Logger, Module } from '@nestjs/common';
import { config } from '../config';
import { MailPort } from './mail.port';
import { ConsoleMail } from './console.mail';
import { SmtpMail } from './smtp.mail';

const log = new Logger('Mail');

@Global()
@Module({
  providers: [{
    provide: MailPort,
    useFactory: () => {
      if (config.mail.smtpUrl) {
        log.log(`Sending mail over SMTP (${config.mail.smtpUrl.replace(/\/\/[^@]*@/, '//***@')})`);
        return new SmtpMail(config.mail.smtpUrl, config.mail.from);
      }
      log.log('No SMTP_URL: mail is logged, not sent');
      return new ConsoleMail((line) => log.log(line));
    },
  }],
  exports: [MailPort],
})
export class MailModule {}

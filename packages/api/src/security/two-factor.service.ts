// Email 2FA codes (TOTP is Supabase MFA on the client; enforcement is AuthGuard + RLS).
// send: refuse what makes no sense (409), rate limit (429), store the HMAC, mail the code.
// verify: check the latest code for that purpose; login -> unlock this session; enable / disable
// -> toggle email 2FA (enabling also unlocks this session; disabling forgets all sessions).
import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { OtpPurpose, TwoFactorState } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import type { AuthUser } from '../core/auth.guard';
import { MailPort } from '../mail/mail.port';
import { config } from '../config';
import { OTP, checkCode, hashCode, newCode, type OtpRow } from './otp';
import { mfaPassed } from './mfa';

const REFUSAL: Record<string, [number, string]> = {
  missing: [400, 'request a code first'],
  wrong: [400, 'wrong code'],
  used: [400, 'this code was already used; request a new one'],
  expired: [400, 'this code expired; request a new one'],
  locked: [429, 'too many attempts; request a new code'],
};

@Injectable()
export class TwoFactorService {
  private log = new Logger('2FA');

  constructor(private supa: SupabaseService, private mail: MailPort) {}

  private get db() { return this.supa.db; }

  private secret(): string {
    if (!config.otpSecret) throw new InternalServerErrorException('email 2FA is not configured: set OTP_SECRET');
    return config.otpSecret;
  }

  /** State as the guard computed it for this request. */
  state(u: AuthUser): TwoFactorState {
    return { totp: u.mfa.totpVerified, email2fa: u.mfa.email2fa, aal: u.mfa.aal, mfaPassed: u.mfaPassed };
  }

  private async fresh(u: AuthUser): Promise<TwoFactorState> {
    const r = await this.db.rpc('mfa_facts', { p_user: u.id, p_session: u.sessionId });
    if (r.error) throw new Error(r.error.message);
    const row = (r.data as { totp_verified: boolean; email_2fa: boolean; session_passed_email: boolean }[])[0];
    const mfa = { aal: u.mfa.aal, totpVerified: row.totp_verified, email2fa: row.email_2fa, sessionPassedEmail: row.session_passed_email };
    return { totp: mfa.totpVerified, email2fa: mfa.email2fa, aal: mfa.aal, mfaPassed: mfaPassed(mfa) };
  }

  async send(u: AuthUser, purpose: OtpPurpose): Promise<void> {
    const secret = this.secret();
    if (!u.email) throw new BadRequestException('this account has no email address');
    if (purpose === 'enable' && u.mfa.email2fa) throw new ConflictException('email codes are already on');
    if (purpose !== 'enable' && !u.mfa.email2fa) throw new ConflictException('email codes are off');

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const recent = await this.db.from('email_otp_codes').select('id', { count: 'exact', head: true }).eq('user_id', u.id).gte('created_at', since);
    if ((recent.count ?? 0) >= OTP.maxSendsPerHour) throw new HttpException('too many codes requested; try again later', 429);

    const code = newCode();
    const ins = await this.db.from('email_otp_codes').insert({
      user_id: u.id, purpose, code_hash: hashCode(secret, u.id, purpose, code), expires_at: new Date(Date.now() + OTP.ttlMs).toISOString(),
    });
    if (ins.error) throw new Error(ins.error.message);
    const what = purpose === 'login' ? 'to finish logging in' : purpose === 'enable' ? 'to turn on email codes' : 'to turn off email codes';
    await this.mail.send({
      to: u.email,
      subject: 'Your Chalkroom code',
      text: `Your Chalkroom code ${what} is ${code}.\nIt expires in 10 minutes. If you did not ask for it, change your password.`,
    });
    this.log.log(`code sent (${purpose}) to user ${u.id.slice(0, 8)}`);
  }

  async verify(u: AuthUser, purpose: OtpPurpose, code: string): Promise<TwoFactorState> {
    const secret = this.secret();
    const latest = await this.db.from('email_otp_codes').select('id, code_hash, expires_at, attempts, consumed_at')
      .eq('user_id', u.id).eq('purpose', purpose).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw new Error(latest.error.message);
    const row = latest.data as (OtpRow & { id: number }) | null;
    const result = checkCode(row, hashCode(secret, u.id, purpose, code), Date.now());
    if (result !== 'ok') {
      if (result === 'wrong' && row) await this.db.from('email_otp_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
      const [status, message] = REFUSAL[result];
      throw new HttpException(message, status);
    }
    await this.db.from('email_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row!.id);

    const passSession = async () => {
      if (!u.sessionId) throw new BadRequestException('this token has no session');
      const r = await this.db.from('mfa_sessions').upsert({ session_id: u.sessionId, user_id: u.id, method: 'email' }, { ignoreDuplicates: true });
      if (r.error) throw new Error(r.error.message);
    };
    if (purpose === 'login') await passSession();
    else if (purpose === 'enable') {
      const r = await this.db.from('user_security').upsert({ user_id: u.id, email_2fa_enabled: true });
      if (r.error) throw new Error(r.error.message);
      await passSession();
    } else {
      const r = await this.db.from('user_security').upsert({ user_id: u.id, email_2fa_enabled: false });
      if (r.error) throw new Error(r.error.message);
      await this.db.from('mfa_sessions').delete().eq('user_id', u.id);
    }
    return this.fresh(u);
  }
}

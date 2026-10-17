// Email 2FA codes (TOTP is Supabase MFA on the client; enforcement is AuthGuard + RLS).
// send: refuse what makes no sense (409), rate limit (429), store the HMAC, mail the code.
// verify: check the latest code for that purpose; login -> unlock this session; enable / disable
// -> toggle email 2FA (enabling also unlocks this session; disabling forgets all sessions).
import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import type { OtpPurpose, TwoFactorState } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import { forgetFacts, type AuthUser } from '../core/auth.guard';
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

  /** Turning email codes on or off changes the account's second factor: it needs one passed
   *  first, or an inbox would stand in for an authenticator app. */
  private guardChange(u: AuthUser, purpose: OtpPurpose) {
    if (purpose !== 'login' && !u.mfaPassed) throw new UnauthorizedException({ statusCode: 401, code: 'mfa_required', message: 'pass your second factor first' });
  }

  async send(u: AuthUser, purpose: OtpPurpose): Promise<void> {
    this.guardChange(u, purpose);
    const secret = this.secret();
    if (!u.email) throw new BadRequestException('this account has no email address');
    if (purpose === 'enable' && u.mfa.email2fa) throw new ConflictException('email codes are already on');
    if (purpose !== 'enable' && !u.mfa.email2fa) throw new ConflictException('email codes are off');

    const code = newCode();
    // the hourly limit and the insert are one locked step (parallel sends cannot pass it)
    const ins = await this.db.rpc('otp_issue', {
      p_user: u.id, p_purpose: purpose, p_hash: hashCode(secret, u.id, purpose, code), p_expires: new Date(Date.now() + OTP.ttlMs).toISOString(), p_max: OTP.maxSendsPerHour,
    });
    if (ins.error) throw new Error(ins.error.message);
    if (ins.data !== true) throw new HttpException('too many codes requested; try again later', 429);
    const what = purpose === 'login' ? 'to finish logging in' : purpose === 'enable' ? 'to turn on email codes' : 'to turn off email codes';
    await this.mail.send({
      to: u.email,
      subject: 'Your Chalkroom code',
      text: `Your Chalkroom code ${what} is ${code}.\nIt expires in 10 minutes. If you did not ask for it, change your password.`,
    });
    this.log.log(`code sent (${purpose}) to user ${u.id.slice(0, 8)}`);
  }

  async verify(u: AuthUser, purpose: OtpPurpose, code: string): Promise<TwoFactorState> {
    this.guardChange(u, purpose);
    const secret = this.secret();
    const latest = await this.db.from('email_otp_codes').select('id, code_hash, expires_at, attempts, consumed_at')
      .eq('user_id', u.id).eq('purpose', purpose).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw new Error(latest.error.message);
    const row = latest.data as (OtpRow & { id: number }) | null;
    const hash = hashCode(secret, u.id, purpose, code);
    const refuse = (why: string): never => { const [status, message] = REFUSAL[why]; throw new HttpException(message, status); };
    const first = checkCode(row, hash, Date.now());
    if (first !== 'ok' && first !== 'wrong') refuse(first);
    // count the attempt before comparing, in one statement: parallel guesses each use one
    const tried = await this.db.rpc('otp_attempt', { p_id: row!.id, p_max: OTP.maxAttempts });
    if (tried.error) throw new Error(tried.error.message);
    const t = (tried.data as { code_hash: string; attempts: number }[])[0];
    if (!t) refuse('locked');
    const result = checkCode({ ...row!, code_hash: t.code_hash, attempts: t.attempts - 1 }, hash, Date.now());
    if (result !== 'ok') refuse(result);
    // consume once: a second request with the same right code finds it already used
    const used = await this.db.from('email_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row!.id).is('consumed_at', null).select('id');
    if (used.error) throw new Error(used.error.message);
    if (!used.data?.length) refuse('used');

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
    forgetFacts(u.id); // the guard must see the new state on the next request
    return this.fresh(u);
  }
}

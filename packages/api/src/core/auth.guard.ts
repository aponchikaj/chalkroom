// Verifies the Supabase JWT and puts the user on the request. Two rules on top:
//   * accounts required (REQUIRE_ACCOUNT=1): anonymous sessions are refused;
//   * second factor: a user who turned on 2FA must pass it in this session, or every route
//     except those marked @AllowWithoutMfa() answers 401 { code: "mfa_required" }.
// Identity is cached per token for 60 s; second-factor facts are read on every request
// (one RPC), so a newly verified factor takes effect at once.
import { ForbiddenException, Injectable, ServiceUnavailableException, SetMetadata, UnauthorizedException, createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from './supabase.service';
import { config } from '../config';
import { mfaPassed, type MfaFacts } from '../security/mfa';

export interface AuthUser {
  id: string;
  anonymous: boolean;
  email: string | null;
  /** JWT session id (`session_id` claim) */
  sessionId: string | null;
  mfa: MfaFacts;
  mfaPassed: boolean;
}

/** Routes a signed-in user needs before passing the second factor (to see and complete it). */
export const AllowWithoutMfa = () => SetMetadata('allowWithoutMfa', true);

interface Identity { id: string; anonymous: boolean; email: string | null }
const cache = new Map<string, { user: Identity; until: number }>();

type Facts = { totp_verified: boolean; email_2fa: boolean; session_passed_email: boolean };
/** user:session -> second-factor facts, for 5 s (one lookup per session per 5 s, not per request) */
const facts = new Map<string, { row: Facts; until: number }>();

/** Drop cached sessions of a user (after account deletion), so their tokens stop working at once. */
export function forgetUser(userId: string) {
  for (const [token, hit] of cache) if (hit.user.id === userId) cache.delete(token);
  forgetFacts(userId);
}

/** Drop a user's cached second-factor facts (the API just changed them). */
export function forgetFacts(userId: string) {
  for (const key of facts.keys()) if (key.startsWith(`${userId}:`)) facts.delete(key);
}

/** Supabase Auth could not answer (network, 5xx): not the token's fault, so not a 401. */
export function authUnavailable(e: { status?: number; name?: string }): boolean {
  return e.name === 'AuthRetryableFetchError' || (e.status ?? 0) >= 500;
}

/** Claims of a token Supabase already verified (getUser). */
function claims(token: string): { aal?: string; session_id?: string; exp?: number } {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { return {}; }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private supa: SupabaseService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('missing bearer token');

    let identity = cache.get(token)?.until! > Date.now() ? cache.get(token)!.user : null;
    if (!identity) {
      const { data, error } = await this.supa.db.auth.getUser(token);
      // 503 keeps the web signed in (it signs out on 401); the client retries
      if (error && authUnavailable(error)) throw new ServiceUnavailableException('sign-in check is unavailable; try again in a moment');
      if (error || !data.user) throw new UnauthorizedException('invalid token');
      identity = { id: data.user.id, anonymous: !!data.user.is_anonymous, email: data.user.email ?? null };
      // never past the token's own expiry
      const exp = claims(token).exp;
      cache.set(token, { user: identity, until: Math.min(Date.now() + 60_000, exp ? exp * 1000 : Infinity) });
      if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    }
    // accounts required (B9): anonymous sessions are refused once the web has login
    if (config.requireAccount && identity.anonymous) throw new ForbiddenException('an account is required: sign up or log in');

    const c = claims(token);
    const sessionId = c.session_id ?? null;
    const key = `${identity.id}:${sessionId ?? ''}`;
    let row = facts.get(key)?.until! > Date.now() ? facts.get(key)!.row : null;
    if (!row) {
      const r = await this.supa.db.rpc('mfa_facts', { p_user: identity.id, p_session: sessionId });
      if (r.error) throw new Error(`mfa_facts: ${r.error.message}`);
      row = (r.data as Facts[])[0];
      facts.set(key, { row, until: Date.now() + 5_000 });
      if (facts.size > 2000) facts.delete(facts.keys().next().value!);
    }
    const mfa: MfaFacts = { aal: c.aal === 'aal2' ? 'aal2' : 'aal1', totpVerified: row.totp_verified, email2fa: row.email_2fa, sessionPassedEmail: row.session_passed_email };
    const user: AuthUser = { ...identity, sessionId, mfa, mfaPassed: mfaPassed(mfa) };

    const allow = this.reflector.getAllAndOverride<boolean>('allowWithoutMfa', [ctx.getHandler(), ctx.getClass()]);
    if (!user.mfaPassed && !allow) throw new UnauthorizedException({ statusCode: 401, code: 'mfa_required', message: 'second factor required' });
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

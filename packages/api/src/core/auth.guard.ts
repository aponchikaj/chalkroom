// Verifies the Supabase JWT and puts the user on the request. Two rules on top:
//   * accounts required (REQUIRE_ACCOUNT=1): anonymous sessions are refused;
//   * second factor: a user who turned on 2FA must pass it in this session, or every route
//     except those marked @AllowWithoutMfa() answers 401 { code: "mfa_required" }.
// Identity is cached per token for 60 s; second-factor facts are read on every request
// (one RPC), so a newly verified factor takes effect at once.
import { ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
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

/** Drop cached sessions of a user (after account deletion), so their tokens stop working at once. */
export function forgetUser(userId: string) {
  for (const [token, hit] of cache) if (hit.user.id === userId) cache.delete(token);
}

/** Claims of a token Supabase already verified (getUser). */
function claims(token: string): { aal?: string; session_id?: string } {
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
      if (error || !data.user) throw new UnauthorizedException('invalid token');
      identity = { id: data.user.id, anonymous: !!data.user.is_anonymous, email: data.user.email ?? null };
      cache.set(token, { user: identity, until: Date.now() + 60_000 });
      if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    }
    // accounts required (B9): anonymous sessions are refused once the web has login
    if (config.requireAccount && identity.anonymous) throw new ForbiddenException('an account is required: sign up or log in');

    const c = claims(token);
    const sessionId = c.session_id ?? null;
    const r = await this.supa.db.rpc('mfa_facts', { p_user: identity.id, p_session: sessionId });
    if (r.error) throw new Error(`mfa_facts: ${r.error.message}`);
    const row = (r.data as { totp_verified: boolean; email_2fa: boolean; session_passed_email: boolean }[])[0];
    const mfa: MfaFacts = { aal: c.aal === 'aal2' ? 'aal2' : 'aal1', totpVerified: row.totp_verified, email2fa: row.email_2fa, sessionPassedEmail: row.session_passed_email };
    const user: AuthUser = { ...identity, sessionId, mfa, mfaPassed: mfaPassed(mfa) };

    const allow = this.reflector.getAllAndOverride<boolean>('allowWithoutMfa', [ctx.getHandler(), ctx.getClass()]);
    if (!user.mfaPassed && !allow) throw new UnauthorizedException({ statusCode: 401, code: 'mfa_required', message: 'second factor required' });
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

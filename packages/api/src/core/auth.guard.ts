// Verifies the Supabase JWT (anonymous or claimed account) and puts the user on the request.
import { ForbiddenException, Injectable, UnauthorizedException, createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { config } from '../config';

export interface AuthUser { id: string; anonymous: boolean }

const cache = new Map<string, { user: AuthUser; until: number }>();

/** Drop cached sessions of a user (after account deletion), so their tokens stop working at once. */
export function forgetUser(userId: string) {
  for (const [token, hit] of cache) if (hit.user.id === userId) cache.delete(token);
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private supa: SupabaseService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('missing bearer token');
    const hit = cache.get(token);
    if (hit && hit.until > Date.now()) {
      if (config.requireAccount && hit.user.anonymous) throw new ForbiddenException('an account is required: sign up or log in');
      req.user = hit.user;
      return true;
    }
    const { data, error } = await this.supa.db.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('invalid token');
    const user: AuthUser = { id: data.user.id, anonymous: !!data.user.is_anonymous };
    cache.set(token, { user, until: Date.now() + 60_000 });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    // accounts required (B9): anonymous sessions are refused once the web has login
    if (config.requireAccount && user.anonymous) throw new ForbiddenException('an account is required: sign up or log in');
    req.user = user;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

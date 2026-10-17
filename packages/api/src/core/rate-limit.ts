// Rate limits per user (or per IP for routes without a login): a sliding window of hit times.
// In memory, per instance: enough to stop scripted abuse (guessing invite codes, spending the
// model budget, filling storage); not a quota system.
import { HttpException, Injectable, SetMetadata, UseGuards, applyDecorators, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;
  constructor(private limit: number, private windowMs: number) {}

  /** Records a hit; 0 when allowed, else ms until the next hit would be. */
  hit(key: string, now = Date.now()): number {
    if (now - this.lastSweep > this.windowMs) this.sweep(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) { this.hits.set(key, recent); return this.windowMs - (now - recent[0]); }
    recent.push(now);
    this.hits.set(key, recent);
    return 0;
  }

  size() { return this.hits.size; }

  private sweep(now: number) {
    this.lastSweep = now;
    for (const [k, ts] of this.hits) if (!ts.length || now - ts[ts.length - 1] >= this.windowMs) this.hits.delete(k);
  }
}

interface Rule { name: string; limit: number; windowMs: number }
const RULE = 'rateLimit';

/** `limit` calls per `windowMs` per user (per IP when nobody is signed in). Runs after the
 *  controller's AuthGuard, so signed-in calls count per account. */
export const RateLimit = (name: string, limit: number, windowMs: number) =>
  applyDecorators(SetMetadata(RULE, { name, limit, windowMs } satisfies Rule), UseGuards(RateLimitGuard));

@Injectable()
export class RateLimitGuard implements CanActivate {
  private limiters = new Map<string, RateLimiter>();
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const rule = this.reflector.get<Rule | undefined>(RULE, ctx.getHandler());
    if (!rule) return true;
    const req = ctx.switchToHttp().getRequest();
    let limiter = this.limiters.get(rule.name);
    if (!limiter) { limiter = new RateLimiter(rule.limit, rule.windowMs); this.limiters.set(rule.name, limiter); }
    const who = (req.user?.id as string | undefined) ?? `ip:${req.ip as string}`;
    const wait = limiter.hit(who);
    if (wait) throw new HttpException({ statusCode: 429, message: `too many requests; try again in ${Math.ceil(wait / 1000)} s` }, 429);
    return true;
  }
}

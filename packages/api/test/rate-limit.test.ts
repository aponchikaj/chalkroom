import { describe, it, expect } from 'vitest';
import { RateLimitGuard, RateLimiter } from '../src/core/rate-limit';

describe('RateLimiter', () => {
  it('allows `limit` hits per window per key, then says how long to wait', () => {
    const r = new RateLimiter(3, 60_000);
    expect([r.hit('a', 0), r.hit('a', 1), r.hit('a', 2)]).toEqual([0, 0, 0]);
    expect(r.hit('a', 3)).toBe(60_000 - 3);
    expect(r.hit('b', 3)).toBe(0); // per key
    expect(r.hit('a', 60_001)).toBe(0); // the window moved on
  });

  it('forgets idle keys so memory stays bounded', () => {
    const r = new RateLimiter(1, 1000);
    for (let i = 0; i < 5000; i++) r.hit(`k${i}`, 0);
    r.hit('late', 10_000);
    expect(r.size()).toBeLessThanOrEqual(1);
  });
});

describe('RateLimitGuard', () => {
  const ctx = (headers: Record<string, string>) => {
    const req = { user: { id: 'ana' }, ip: '1.2.3.4' } as Record<string, unknown>;
    return {
      req, headers,
      ctx: { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ setHeader: (k: string, v: string) => { headers[k] = v; } }) }), getHandler: () => 'h' } as never,
    };
  };
  const reflector = { get: () => ({ name: 'test', limit: 1, windowMs: 60_000 }) } as never;

  it('a 429 carries Retry-After in seconds', () => {
    const guard = new RateLimitGuard(reflector);
    expect(guard.canActivate(ctx({}).ctx)).toBe(true);
    const second = ctx({});
    expect(() => guard.canActivate(second.ctx)).toThrow(/too many requests/);
    expect(Number(second.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('a refused body gives its hit back', () => {
    const guard = new RateLimitGuard(reflector);
    const first = ctx({});
    guard.canActivate(first.ctx);
    (first.req.rateLimitRefund as () => void)();
    expect(guard.canActivate(ctx({}).ctx)).toBe(true);
  });
});

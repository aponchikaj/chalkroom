import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/core/rate-limit';

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

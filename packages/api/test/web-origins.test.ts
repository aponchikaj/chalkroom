import { describe, expect, it, vi } from 'vitest';

async function origins(webUrl: string) {
  vi.resetModules();
  vi.stubEnv('WEB_URL', webUrl);
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:55421');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
  const { config } = await import('../src/config');
  vi.unstubAllEnvs();
  return config;
}
const allowed = (list: (string | RegExp)[], o: string) => list.some((x) => (typeof x === 'string' ? x === o : x.test(o)));

describe('WEB_URL origins', () => {
  it('takes a list; the first is the invite address', async () => {
    const c = await origins('https://chalkroom.vercel.app/, https://chalkroom-*.vercel.app');
    expect(c.webUrl).toBe('https://chalkroom.vercel.app');
    expect(allowed(c.webOrigins, 'https://chalkroom.vercel.app')).toBe(true);
    expect(allowed(c.webOrigins, 'https://chalkroom-git-main-team.vercel.app')).toBe(true);
  });
  it('a wildcard stays inside one host label', async () => {
    const c = await origins('https://chalkroom-*.vercel.app');
    expect(allowed(c.webOrigins, 'https://chalkroom-x.vercel.app.evil.com')).toBe(false);
    expect(allowed(c.webOrigins, 'https://evil.com/chalkroom-x.vercel.app')).toBe(false);
    expect(allowed(c.webOrigins, 'https://chalkroom-a.b.vercel.app')).toBe(false);
  });
});

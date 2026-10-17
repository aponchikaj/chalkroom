// packages/api/test/url-guard.test.ts
import { describe, it, expect } from 'vitest';
import { isFetchable } from '../src/rag/url-guard';

describe('isFetchable', () => {
  it('allows public http(s)', () => expect(isFetchable(new URL('https://docs.solana.com/x'), ['104.18.1.1'])).toBeNull());
  it.each([
    ['ftp://x.com', ['1.1.1.1'], 'http'],
    ['http://localhost/', ['127.0.0.1'], 'private'],
    ['http://intranet/', ['10.0.0.5'], 'private'],
    ['http://x/', ['172.20.0.1'], 'private'],
    ['http://x/', ['192.168.1.2'], 'private'],
    ['http://x/', ['169.254.169.254'], 'private'],
    ['http://x/', ['::1'], 'private'],
    ['http://x/', ['fd00::1'], 'private'],
    ['http://x/', ['::ffff:127.0.0.1'], 'private'],
    ['http://x:22/', ['1.1.1.1'], 'port'],
  ])('refuses %s', (u, addrs, why) => expect(isFetchable(new URL(u), addrs)).toContain(why));
});

describe('isFetchable: more reserved ranges', () => {
  const u = new URL('https://example.com/');
  it.each([
    ['240.0.0.1'], ['255.255.255.255'], ['198.18.0.1'], ['192.0.0.8'], ['192.0.2.1'], ['100.64.0.1'],
    ['64:ff9b::a9fe:a9fe'], ['::a9fe:a9fe'], ['2002:a9fe:a9fe::1'], ['fec0::1'], ['ff02::1'], ['::ffff:7f00:1'],
  ])('refuses %s', (addr) => {
    expect(isFetchable(u, [addr])).toMatch(/private/);
  });
  it('still allows public addresses', () => {
    expect(isFetchable(u, ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])).toBeNull();
  });
});

describe('publicOnlyLookup (connect-time check)', () => {
  it('refuses a host that resolves to a private address at connect time', async () => {
    const { publicOnlyLookup } = await import('../src/rag/fetch-page');
    const err = await new Promise<Error | null>((r) => publicOnlyLookup('localhost', {}, (e) => r(e)));
    expect(err?.message).toMatch(/private/);
  });
});

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

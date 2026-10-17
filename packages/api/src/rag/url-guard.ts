// packages/api/src/rag/url-guard.ts
// Pure SSRF guard for web sources: http(s) on 80/443/default only, and every resolved address public.
import { isIP } from 'node:net';

const V4_PRIVATE: [number, number][] = [[0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12], [0xc0a80000, 16], [0xe0000000, 4]];
const v4 = (ip: string) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
const inV4 = (ip: string) => V4_PRIVATE.some(([base, bits]) => (v4(ip) >>> (32 - bits)) === (base >>> (32 - bits)));

function isPrivate(addr: string): boolean {
  const a = addr.toLowerCase();
  if (isIP(a) === 4) return inV4(a);
  if (a.startsWith('::ffff:')) return isPrivate(a.slice(7));
  return a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb');
}

/** null when fetching is allowed, else the reason. `addresses`: every DNS result for the host. */
export function isFetchable(url: URL, addresses: string[]): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'only http and https links';
  if (url.port && url.port !== '80' && url.port !== '443') return 'only the default web port';
  if (!addresses.length) return 'host does not resolve';
  if (addresses.some(isPrivate)) return 'private network addresses are not allowed';
  return null;
}

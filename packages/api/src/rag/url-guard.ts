// packages/api/src/rag/url-guard.ts
// Pure SSRF guard for web sources: http(s) on 80/443/default only, and every address public.
// IPv4: a deny list of every special-purpose range (RFC 6890 and friends). IPv6: an allow list,
// global unicast 2000::/3 only, minus the ranges that tunnel or embed IPv4; IPv4-mapped and
// IPv4-compatible addresses are judged by the IPv4 inside.
import { isIP } from 'node:net';

const V4_SPECIAL: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const v4 = (ip: string) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
const V4_RANGES = V4_SPECIAL.map(([base, bits]) => [v4(base), bits] as const);
const v4Private = (n: number) => V4_RANGES.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));

/** 16 bytes of an IPv6 address (with :: and a trailing dotted quad), or null. */
function v6Bytes(addr: string): number[] | null {
  let a = addr.toLowerCase().split('%')[0];
  const quad = /(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (quad) {
    const n = v4(quad[1]);
    a = `${a.slice(0, -quad[1].length)}${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail, extra] = a.split('::');
  if (extra !== undefined) return null;
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : null;
  const groups = t === null ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.flatMap((g) => { const n = parseInt(g, 16); return [n >> 8, n & 0xff]; });
}

function isPrivate(addr: string): boolean {
  const kind = isIP(addr);
  if (kind === 4) return v4Private(v4(addr));
  if (kind !== 6) return true;
  const b = v6Bytes(addr);
  if (!b) return true;
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  const embedded = () => ((b[12] << 24) | (b[13] << 16) | (b[14] << 8) | b[15]) >>> 0;
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible): the IPv4 decides; :: and ::1 are private
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return v4Private(embedded());
  if (zeros(0, 12)) return zeros(12, 15) ? true : v4Private(embedded());
  if ((b[0] & 0xe0) !== 0x20) return true; // not global unicast (fc00::/7, fe80::/10, fec0::, ff00::/8 ...)
  if (b[0] === 0x20 && b[1] === 0x02) return true; // 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // Teredo
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // documentation
  return false;
}

/** true when the address may be connected to (also used at connect time by fetch-page). */
export const isPublicAddress = (addr: string) => !isPrivate(addr);

/** null when fetching is allowed, else the reason. `addresses`: every DNS result for the host. */
export function isFetchable(url: URL, addresses: string[]): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'only http and https links';
  if (url.port && url.port !== '80' && url.port !== '443') return 'only the default web port';
  if (!addresses.length) return 'host does not resolve';
  if (addresses.some(isPrivate)) return 'private network addresses are not allowed';
  return null;
}

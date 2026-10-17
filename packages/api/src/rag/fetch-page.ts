// Fetch a web page for a link source. Every hop (redirects included) is checked by the SSRF
// guard, and the address actually connected to is checked again at connect time (the socket's
// own DNS lookup), so a DNS answer that changes between the check and the connect (rebinding)
// cannot reach a private address. 10 s timeout, 5 MB cap, HTML or plain text only.
import { lookup } from 'node:dns/promises';
import { lookup as lookupCb, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { isFetchable, isPublicAddress } from './url-guard';

const MAX_BYTES = 5 * 1024 * 1024;

export async function guardUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('not a valid link'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http and https links');
  let addresses: string[] = [];
  try { addresses = (await lookup(url.hostname, { all: true })).map((a) => a.address); } catch { /* unresolvable */ }
  const why = isFetchable(url, addresses);
  if (why) throw new Error(why);
  return url;
}

/** The socket's DNS lookup: refuses to hand back any non-public address. */
export const publicOnlyLookup: LookupFunction = (hostname, options, cb) => {
  lookupCb(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 0);
    const list = addresses as unknown as LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || !list.length) return cb(Object.assign(new Error('private network addresses are not allowed'), { code: 'EPRIVATE' }), '', 0);
    if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    cb(null, list[0].address, list[0].family);
  });
};

interface Hop { status: number; location: string | null; type: string; body?: Buffer }

function get(url: URL): Promise<Hop> {
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(url, {
      lookup: publicOnlyLookup,
      timeout: 10_000,
      headers: { 'user-agent': 'ChalkroomBot/1.0 (+classroom sources)', accept: 'text/html,text/plain' },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const type = String(res.headers['content-type'] ?? '');
      const location = (res.headers.location as string | undefined) ?? null;
      if ((status >= 300 && status < 400) || status < 200 || status >= 300 || !/^text\/(html|plain)/.test(type)) {
        res.resume(); // drain: nothing to read
        return resolve({ status, location, type });
      }
      const parts: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) { req.destroy(); reject(new Error('the page is larger than 5 MB')); return; }
        parts.push(chunk);
      });
      res.on('end', () => resolve({ status, location, type, body: Buffer.concat(parts) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('the page took too long to answer')));
    req.on('error', (e: NodeJS.ErrnoException) => reject(e.code === 'EPRIVATE' ? new Error('private network addresses are not allowed') : e));
  });
}

export async function fetchPage(raw: string): Promise<{ body: Buffer; mime: 'text/html' | 'text/plain' }> {
  let url = await guardUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const r = await get(url);
    if (r.status >= 300 && r.status < 400 && r.location) { url = await guardUrl(new URL(r.location, url).toString()); continue; }
    if (r.status < 200 || r.status >= 300) throw new Error(`the page answered ${r.status}`);
    if (!r.body) throw new Error(`not a web page (${r.type || 'no content type'})`);
    return { body: r.body, mime: r.type.startsWith('text/html') ? 'text/html' : 'text/plain' };
  }
  throw new Error('too many redirects');
}

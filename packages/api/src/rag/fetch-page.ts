// Fetch a web page for a link source. Every hop (redirects included) is checked by the SSRF
// guard against the host's resolved addresses; 10 s timeout, 5 MB cap, HTML or plain text only.
import { lookup } from 'node:dns/promises';
import { isFetchable } from './url-guard';

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

export async function fetchPage(raw: string): Promise<{ body: Buffer; mime: 'text/html' | 'text/plain' }> {
  let url = await guardUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'ChalkroomBot/1.0 (+classroom sources)', accept: 'text/html,text/plain' } });
    const location = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && location) { url = await guardUrl(new URL(location, url).toString()); continue; }
    if (!r.ok) throw new Error(`the page answered ${r.status}`);
    const type = r.headers.get('content-type') ?? '';
    if (!/^text\/(html|plain)/.test(type)) throw new Error(`not a web page (${type || 'no content type'})`);
    const reader = r.body!.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('the page is larger than 5 MB'); }
      parts.push(value);
    }
    return { body: Buffer.concat(parts), mime: type.startsWith('text/html') ? 'text/html' : 'text/plain' };
  }
  throw new Error('too many redirects');
}

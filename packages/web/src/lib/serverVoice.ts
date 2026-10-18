// The Natural voice: speech made on our server (Kokoro, packages/api/src/tts), one file per
// sentence in the public Storage bucket `tts`, shared by every learner. Nothing downloads to the
// browser but the sentences themselves, so it works on phones too.
// A sentence's file is <sha256(ttsKeySource(text))>.wav, where text is exactly what
// splitSentences gave the board player; the API makes the same key for the same text. The
// server makes the class's narration ahead of time; a sentence it has not made yet is asked for
// (POST /tts) and polled (GET /tts/:key). The caller decides how long to wait.
import { create } from 'zustand';
import { ttsKeySource, type TtsEngine, type TtsRes } from '@chalk/schema';

const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? '';
const API_URL = (import.meta.env?.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

export const ttsPublicUrl = (key: string) => `${SUPABASE_URL}/storage/v1/object/public/tts/${key}.wav`;

/** What the API makes: 'kokoro' (the Natural voice exists) or 'off'; null until /health answers. */
export const useServerVoice = create<{ engine: TtsEngine | null }>(() => ({ engine: null }));

let asked = false;
/** Read /health once per page load. */
export function loadServerVoice() {
  if (asked || typeof fetch === 'undefined' || typeof location === 'undefined') return;
  asked = true;
  fetch(`${API_URL}/health`)
    .then((r) => (r.ok ? r.json() : null))
    .then((h: { tts?: TtsEngine } | null) => useServerVoice.setState({ engine: h?.tts === 'kokoro' ? 'kokoro' : 'off' }))
    .catch(() => useServerVoice.setState({ engine: 'off' }));
}

/** The key of one sentence: SHA-256 hex of ttsKeySource(text); null without Web Crypto
 *  (a page over plain http on the network), where POST /tts tells the key instead. */
export async function ttsKey(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const hash = await subtle.digest('SHA-256', new TextEncoder().encode(ttsKeySource(text)));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** one sentence's audio on its way; ask: a learner waits for it now (not only a prefetch) */
interface Entry { p: Promise<string | null>; ask: boolean }
/** text -> the sentence's audio as an object URL (null: not available) */
const clips = new Map<string, Entry>();
const KEEP = 48;
/** how long a sentence may stay pending on the server before it is given up */
const POLL_MS = 20_000;
const POLL_EVERY = 250;

async function download(url: string): Promise<string | null> {
  const r = await fetch(url, { cache: 'force-cache' }).catch(() => null);
  if (!r?.ok) return null;
  const blob = await r.blob();
  return blob.size > 44 ? URL.createObjectURL(blob) : null;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Storage first (the server made it ahead of the class: one plain GET of a public file). If it
 *  is not there: a prefetch only watches the server's queue (GET /tts/:key), so the class's
 *  sentences keep their order; a sentence a learner waits for is asked for (POST /tts, first in line). */
async function make(text: string, entry: Entry): Promise<string | null> {
  const key = await ttsKey(text);
  if (key) {
    const hit = await download(ttsPublicUrl(key));
    if (hit) return hit;
  }
  if (useServerVoice.getState().engine !== 'kokoro') return null;
  const { api } = await import('./api');
  let asked = entry.ask || !key;
  let res: TtsRes = asked ? await api.tts({ text }) : await api.ttsStatus(key!);
  const until = performance.now() + POLL_MS;
  while (res.status === 'pending' && performance.now() < until) {
    await pause(POLL_EVERY);
    if (entry.ask && !asked) { asked = true; res = await api.tts({ text }); } else res = await api.ttsStatus(res.key);
  }
  return res.status === 'ready' ? download(res.url) : null;
}

/** The audio of one sentence (an object URL), fetched once; null when there is none.
 *  ask: a learner waits for it now, so the server makes it next if it has not yet. */
export function clipFor(text: string, ask = false): Promise<string | null> {
  const hit = clips.get(text);
  if (hit) {
    clips.delete(text); clips.set(text, hit); // most recent last
    hit.ask ||= ask;
    return hit.p;
  }
  const entry: Entry = { p: Promise.resolve(null), ask };
  entry.p = make(text, entry).catch(() => null);
  clips.set(text, entry);
  // a sentence that could not be had may be tried again later
  void entry.p.then((url) => { if (!url && clips.get(text) === entry) clips.delete(text); });
  while (clips.size > KEEP) {
    const [oldest, old] = clips.entries().next().value as [string, Entry];
    clips.delete(oldest);
    void old.p.then((url) => { if (url) URL.revokeObjectURL(url); });
  }
  return entry.p;
}

/** Wait for a sentence a learner needs now at most ms; null when it is not there in time. */
export function clipWithin(text: string, ms: number): Promise<string | null> {
  return Promise.race([clipFor(text, true), pause(ms).then(() => null)]);
}

// Lane C: the host tooling endpoints (packages/api/src/host). Kept beside the controls that use
// them so lib/api.ts stays one lane's file. Same auth and error shape as lib/api; requests time
// out after 10 s. In the dev preview (/dev/classroom, fixture room) they act on the store instead.
import type { z } from 'zod';
import type { Api, HostCheckAnswer, StreamEvent } from '@chalk/schema';
import { ApiError } from '../../lib/api';
import { ensureSession, supabase } from '../../lib/supabase';
import { useRoom } from '../../room/store';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';
const DEV_ROOM = '00000000-0000-4000-8000-0000000000aa';
type In<K extends keyof typeof Api> = z.input<(typeof Api)[K]>;
export type HostControlAction = In<'hostControl'>['action'];

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  await ensureSession();
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new ApiError(r.status, Array.isArray(j.message) ? j.message.join('; ') : j.message ?? r.statusText, j.code);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

const dev = (roomId: string) => import.meta.env.DEV && roomId === DEV_ROOM;

/** dev preview: post the notice the API would post */
function devNotice(text: string, control: StreamEvent<'notice'>['data']['control']) {
  const s = useRoom.getState();
  const last = s.mainEvents[s.mainEvents.length - 1];
  s.applyMainEvent({
    stream_id: last?.stream_id ?? 'dev', room_id: DEV_ROOM, seq: (last?.seq ?? 0) + 1, kind: 'notice',
    data: { text, level: 'info', control }, actor: s.me ?? 'system', t: new Date().toISOString(),
  } as StreamEvent);
}
const DEV_TEXT: Record<HostControlAction, string> = {
  pause: 'You paused the tutor. The board waits until you resume.',
  resume: 'You resumed the tutor.',
  slower: 'You asked for a slower pace. The next part re-explains before it moves on.',
  skip: 'You moved the class on to the next part.',
};

export const hostApi = {
  control: async (roomId: string, b: In<'hostControl'>) => {
    if (dev(roomId)) return devNotice(DEV_TEXT[b.action], b.action);
    await call<{ ok: true }>('POST', `/rooms/${roomId}/host/control`, b);
  },
  reexplain: async (roomId: string, b: In<'hostReexplain'>) => {
    if (dev(roomId)) return devNotice(`You asked the tutor to re-explain "${b.label ?? 'this figure'}" in the next Q&A.`, 'reexplain');
    await call<{ ok: true }>('POST', `/rooms/${roomId}/host/reexplain`, b);
  },
  /** For the question cards (lane R): the host pins a question's group to the next Q&A. */
  pin: async (roomId: string, b: In<'hostPin'>) => {
    if (dev(roomId)) return devNotice('You pinned a question to the next Q&A.', 'pin');
    await call<{ ok: true }>('POST', `/rooms/${roomId}/host/pin`, b);
  },
  checkAnswers: async (roomId: string, checkId: string): Promise<HostCheckAnswer[]> => {
    if (dev(roomId)) {
      // the fixture class: Ana and Nika answered, Gio is away
      const s = useRoom.getState();
      return Object.values(s.members).filter((m) => s.presence[m.user_id] && (m.user_id === s.me ? s.answered[checkId] : true))
        .slice(0, 3).map((m, i) => ({ userId: m.user_id, correct: s.closedChecks[checkId] ? i !== 1 : null }));
    }
    return call<HostCheckAnswer[]>('GET', `/rooms/${roomId}/host/checks/${checkId}/answers`);
  },
};

/** Whether the host paused the tutor for the class: the last pause or resume notice wins. */
export function narrationPaused(events: readonly StreamEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind !== 'notice') continue;
    const c = (events[i] as StreamEvent<'notice'>).data.control;
    if (c === 'pause') return true;
    if (c === 'resume') return false;
  }
  return false;
}

// /dev/classroom?state=check&as=nika : the real ClassroomView on fixture data, with a fake
// connection and a fake API that changes the store, so every screen can be designed, clicked
// through and screenshotted with no backend. Dev builds only (see main.tsx).
import { useEffect, useMemo, useState } from 'react';
import type { LaserPayload, PresenceState, QuestionRow, StreamEvent, ThreadRow } from '@chalk/schema';
import { mockThreadReply } from '@chalk/mock-tutor';
import { mainPlayer, useRoom } from '../room/store';
import { RoomConnContext } from '../room/context';
import type { RoomConnection } from '../room/connection';
import { api } from '../lib/api';
import { ClassroomView } from '../screens/ClassroomView';
import { buildFixture, DEV_STATES, USERS, type DevState, type DevUser, ROOM_ID, THREAD_STREAM } from './fixtures';

const later = (ms: number, fn: () => void) => setTimeout(fn, ms);
const now = () => new Date().toISOString();

/** Thread-stream events for the fake connection (A3 builds the drawer on these). */
const threadEvents: StreamEvent[] = [];
const eventListeners = new Set<(ev: StreamEvent) => void>();
const laserListeners = new Set<(p: LaserPayload) => void>();
const emit = (ev: StreamEvent) => { threadEvents.push(ev); for (const fn of eventListeners) fn(ev); };
const devThreadEvents = (streamId: string, after: number) => threadEvents.filter((e) => e.stream_id === streamId && e.seq > after);

function fakeConnection(): RoomConnection {
  return {
    channel: null as unknown as RoomConnection['channel'],
    track: (patch: Partial<PresenceState>) => useRoom.setState((s) => {
      const me = s.me!;
      return { presence: { ...s.presence, [me]: { ...s.presence[me], ...patch } } };
    }),
    onEvent: (fn) => { eventListeners.add(fn); return () => eventListeners.delete(fn); },
    fetchEvents: async (streamId, after) => devThreadEvents(streamId, after),
    onLaser: (fn) => { laserListeners.add(fn); return () => laserListeners.delete(fn); },
    sendLaser: () => {},
    close: () => {},
  };
}

/** Replace network calls with local store changes that behave like the real backend. */
function installDevApi() {
  const st = () => useRoom.getState();
  const set = useRoom.setState;
  Object.assign(api, {
    ask: async (_room: string, b: { text: string; anchor?: QuestionRow['anchor'] }) => {
      const me = st().members[st().me!];
      const q: QuestionRow = { id: `q-${Date.now()}`, room_id: ROOM_ID, author_id: me.user_id, author_name: me.display_name, text: b.text, anchor: b.anchor ?? null, segment: st().room!.segment, cluster_id: null, status: 'pending', votes: 0, created_at: now() };
      set((s) => ({ questions: { ...s.questions, [q.id]: q } }));
      // simulated triage: within ~2 s the question joins the class cluster or gets an inline answer
      later(1800, () => set((s) => {
        const grouped = /sign/i.test(b.text);
        const cur = s.questions[q.id];
        if (!cur) return {};
        if (grouped) {
          const c = s.clusters['c-sign'];
          return { questions: { ...s.questions, [q.id]: { ...cur, status: 'grouped', cluster_id: 'c-sign' } }, clusters: c ? { ...s.clusters, 'c-sign': { ...c, asker_count: c.asker_count + 1 } } : s.clusters };
        }
        const id = `c-${q.id}`;
        return {
          questions: { ...s.questions, [q.id]: { ...cur, status: 'answered', cluster_id: id } },
          clusters: { ...s.clusters, [id]: { id, room_id: ROOM_ID, title: b.text, route: 'inline', reason: null, target_segment: null, answer: 'Short answer (dev preview): a PDA has no private key, so only its program can sign for it.', answered: false, asker_count: 1, created_at: now() } },
        };
      }));
      return q;
    },
    vote: async (questionId: string) => set((s) => {
      const q = s.questions[questionId];
      return q ? { questions: { ...s.questions, [questionId]: { ...q, votes: q.votes + 1 } } } : {};
    }),
    ready: async (_r: string, b: { segment: number }) => set((s) => ({ readyVotes: [...s.readyVotes, { room_id: ROOM_ID, segment: b.segment, user_id: s.me!, created_at: now() }] })),
    answerCheck: async (_r: string, checkId: string) => set((s) => ({ answered: { ...s.answered, [checkId]: true } })),
    react: async (_r: string, b: { shapeId: string; kind: 'confused' | 'got_it' }) => set((s) => {
      const mine = s.reactions.find((r) => r.user_id === s.me && r.shape_id === b.shapeId);
      const rest = s.reactions.filter((r) => r !== mine);
      return { reactions: mine?.kind === b.kind ? rest : [...rest, { room_id: ROOM_ID, user_id: s.me!, shape_id: b.shapeId, kind: b.kind, created_at: now() }] };
    }),
    start: async () => ({ ok: true }),
    host: async (_r: string, b: { action: string }) => {
      if (b.action === 'hold') set((s) => ({ room: { ...s.room!, gate_held: true, gate_deadline: null } }));
      if (b.action === 'resume') set((s) => ({ room: { ...s.room!, gate_held: false } }));
      if (b.action === 'end') set((s) => ({ room: { ...s.room!, phase: 'ended' } }));
      return { ok: true };
    },
    leave: async () => {},
    openThread: async (_r: string, b: { topic?: string; threadId?: string }) => {
      const s = st();
      const existing = b.threadId ? s.threads[b.threadId] : undefined;
      const t: ThreadRow = existing ? { ...existing, status: 'open' } : { id: `th-${Date.now()}`, room_id: ROOM_ID, owner_id: s.me!, stream_id: THREAD_STREAM, topic: b.topic ?? 'A closer look', status: 'open', shared_answer: null, left_main_seq: s.mainEvents.at(-1)?.seq ?? 0, created_at: now() };
      set((x) => ({ threads: { ...x.threads, [t.id]: t }, openThreadId: t.id }));
      return t;
    },
    threadMessage: async (threadId: string, b: { text: string }) => {
      const t = st().threads[threadId];
      const seq = () => threadEvents.filter((e) => e.stream_id === t.stream_id).length + 1;
      emit({ stream_id: t.stream_id, room_id: ROOM_ID, seq: seq(), kind: 'chat', data: { role: 'learner', markdown: b.text, authorId: st().me! }, actor: st().me!, t: now() } as StreamEvent);
      const r = mockThreadReply(b.text);
      later(900, () => emit({ stream_id: t.stream_id, room_id: ROOM_ID, seq: seq(), kind: 'chat', data: { role: 'tutor', markdown: r.markdown }, actor: 'thread', t: now() } as StreamEvent));
      later(1100, () => emit({ stream_id: t.stream_id, room_id: ROOM_ID, seq: seq(), kind: 'board', data: { steps: r.steps }, actor: 'thread', t: now() } as StreamEvent));
    },
    closeThread: async (threadId: string) => set((s) => ({ threads: { ...s.threads, [threadId]: { ...s.threads[threadId], status: 'closed' } }, openThreadId: null })),
    shareThread: async (threadId: string, b: { markdown?: string }) => set((s) => ({ threads: { ...s.threads, [threadId]: { ...s.threads[threadId], shared_answer: b.markdown ?? 'Shared from a thread.' } } })),
  });
}

export function DevClassroom() {
  const params = new URLSearchParams(location.search);
  const state = (DEV_STATES.includes(params.get('state') as DevState) ? params.get('state') : 'teaching') as DevState;
  const as = (params.get('as') && params.get('as')! in USERS ? params.get('as') : 'ana') as DevUser;
  const conn = useMemo(fakeConnection, []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installDevApi();
    const f = buildFixture(state, as);
    threadEvents.length = 0;
    threadEvents.push(...f.threadEvents);
    const store = useRoom.getState();
    store.reset();
    useRoom.setState({
      me: f.me, conn: 'live', room: f.room, members: f.members, presence: f.presence, questions: f.questions, clusters: f.clusters,
      threads: f.threads, readyVotes: f.readyVotes, reactions: f.reactions, notes: f.notes, answered: f.answered, openThreadId: f.openThreadId,
    });
    mainPlayer.reset();
    mainPlayer.setMuted(true);
    for (const ev of f.mainEvents) { useRoom.getState().applyMainEvent(ev); mainPlayer.push(ev, false); }
    if (f.caption) mainPlayer.caption = f.caption;
    mainPlayer.setViewPage(null);
    setReady(true);
  }, [state, as]);

  if (!ready) return null;
  return (
    <RoomConnContext.Provider value={conn}>
      <ClassroomView />
      <nav className="dev-switcher" aria-label="Dev preview">
        {DEV_STATES.map((s) => <a key={s} href={`/dev/classroom?state=${s}&as=${as}`} aria-current={s === state}>{s}</a>)}
        <span>as</span>
        {(Object.keys(USERS) as DevUser[]).map((u) => <a key={u} href={`/dev/classroom?state=${state}&as=${u}`} aria-current={u === as}>{u}</a>)}
      </nav>
    </RoomConnContext.Provider>
  );
}

// Joins the private realtime channel `room:{id}`, loads the room snapshot (RLS: members
// only), keeps rows fresh from "row" broadcasts and feeds main-stream events to the player
// through StreamSync. Presence carries who is here / in a thread / typing.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { RT, roomTopic, type LaserPayload, type PresenceState, type RowChange, type StreamEvent } from '@chalk/schema';
import { ensureSession, supabase } from '../lib/supabase';
import { StreamSync } from '../lib/sync';
import { mainPlayer, useRoom } from './store';

export async function fetchEvents(streamId: string, afterSeq: number): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for (let after = afterSeq; ;) {
    const r = await supabase.from('events').select('*').eq('stream_id', streamId).gt('seq', after).order('seq').limit(1000);
    if (r.error) throw new Error(r.error.message);
    out.push(...(r.data as StreamEvent[]));
    if (r.data.length < 1000) return out;
    after = (r.data[r.data.length - 1] as StreamEvent).seq;
  }
}

async function loadRows(roomId: string) {
  const [room, members, questions, clusters, threads, ready, reactions, notes, answers] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).single(),
    supabase.from('room_members').select('*').eq('room_id', roomId),
    supabase.from('questions').select('*').eq('room_id', roomId),
    supabase.from('clusters').select('*').eq('room_id', roomId),
    supabase.from('threads').select('*').eq('room_id', roomId),
    supabase.from('ready_votes').select('*').eq('room_id', roomId),
    supabase.from('reactions').select('*').eq('room_id', roomId),
    supabase.from('note_blocks').select('*').eq('room_id', roomId),
    supabase.from('check_answers').select('check_id').eq('room_id', roomId),
  ]);
  // no row under RLS: not (or no longer) a member, e.g. removed by the host
  if (room.error?.code === 'PGRST116') throw new Removed();
  if (room.error) throw new Error(`Could not load the room: ${room.error.message}`);
  const byKey = <T>(rows: T[] | null, key: (r: T) => string) => Object.fromEntries((rows ?? []).map((r) => [key(r), r]));
  useRoom.setState({
    room: room.data,
    members: byKey(members.data, (m) => m.user_id),
    questions: byKey(questions.data, (q) => q.id),
    clusters: byKey(clusters.data, (c) => c.id),
    threads: byKey(threads.data, (t) => t.id),
    readyVotes: ready.data ?? [],
    reactions: reactions.data ?? [],
    notes: byKey(notes.data, (n) => n.id),
    answered: Object.fromEntries((answers.data ?? []).map((a) => [a.check_id, true])),
  });
}

export interface RoomConnection {
  /** update this device's presence (e.g. entering a thread) */
  track: (patch: Partial<PresenceState>) => void;
  /** live stream events for any stream (thread drawers subscribe here) */
  onEvent: (fn: (ev: StreamEvent) => void) => () => void;
  /** past events of any stream in this room (snapshot / gap fill for a StreamSync) */
  fetchEvents: (streamId: string, afterSeq: number) => Promise<StreamEvent[]>;
  onLaser: (fn: (p: LaserPayload) => void) => () => void;
  sendLaser: (p: LaserPayload) => void;
  close: () => void;
}

/** The room is not readable any more: the host removed this learner. */
export class Removed extends Error {
  constructor() { super('removed from this class'); }
}

/** Thrown when a newer connectRoom() started before this one finished (e.g. StrictMode). */
export class Superseded extends Error {}
let generation = 0;
const PRESENCE_GAP_MS = 1500;

export async function connectRoom(roomId: string, me: { name: string; color: string }): Promise<RoomConnection> {
  const gen = ++generation;
  const current = () => { if (gen !== generation) throw new Superseded('superseded'); };
  const session = await ensureSession();
  current();
  const userId = session.user.id;
  useRoom.getState().reset();
  useRoom.setState({ me: userId, conn: 'connecting' });
  mainPlayer.reset();

  await supabase.realtime.setAuth(session.access_token);
  await loadRows(roomId);
  current();
  const mainStreamId = useRoom.getState().room!.main_stream_id;
  const main = new StreamSync(mainStreamId, (after) => fetchEvents(mainStreamId, after), (ev, live) => {
    // a fetch or broadcast that lands after close() must not play on another page
    if (gen !== generation || closed) return;
    useRoom.getState().applyMainEvent(ev);
    mainPlayer.push(ev, live);
  });

  const eventListeners = new Set<(ev: StreamEvent) => void>();
  const laserListeners = new Set<(p: LaserPayload) => void>();
  let presence: PresenceState = { userId, name: me.name, color: me.color, threadId: null, typing: false, onlineAt: new Date().toISOString() };
  let started = false;
  let closed = false;
  let channel: RealtimeChannel;
  let retries = 0;
  let retryTimer = 0;

  // Presence is rate limited per client by Realtime (going over closes the channel), so
  // updates are coalesced: at most one track every PRESENCE_GAP_MS, always the latest state.
  let sent = '';
  let lastTrack = 0;
  let trackTimer = 0;
  const flushPresence = () => {
    trackTimer = 0;
    const next = JSON.stringify(presence);
    if (next === sent) return;
    sent = next;
    lastTrack = Date.now();
    void channel.track(presence);
  };
  const schedulePresence = () => {
    if (trackTimer) return;
    trackTimer = window.setTimeout(flushPresence, Math.max(0, PRESENCE_GAP_MS - (Date.now() - lastTrack)));
  };

  /** Join (or rejoin) the room channel. Realtime closes a channel on some errors and does not
   *  reopen it, so an unexpected close schedules a fresh join with backoff. */
  const join = async () => {
    // supabase-js hands back an existing channel with the same topic instead of a new one, so a
    // channel left over from an earlier connection (still closing) must go first
    for (const old of supabase.getChannels()) if (old.topic === `realtime:${roomTopic(roomId)}`) await supabase.removeChannel(old);
    if (closed || gen !== generation) return;
    const ch = supabase.channel(roomTopic(roomId), { config: { private: true, presence: { key: userId } } });
    channel = ch;
    ch
      .on('broadcast', { event: RT.event }, ({ payload }) => {
        if (closed) return;
        const ev = payload as StreamEvent;
        main.receive(ev);
        for (const fn of eventListeners) fn(ev);
      })
      .on('broadcast', { event: RT.row }, ({ payload }) => useRoom.getState().applyRow(payload as RowChange))
      .on('broadcast', { event: RT.laser }, ({ payload }) => { for (const fn of laserListeners) fn(payload as LaserPayload); })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<PresenceState>();
        useRoom.setState({ presence: Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v[0]])) });
      })
      .subscribe(async (status, err) => {
        if (import.meta.env.DEV) console.info(`[room] channel ${status}${err ? ` ${err.message}` : ''}`);
        if (gen !== generation || closed || ch !== channel || useRoom.getState().conn === 'removed') return;
        if (status === 'SUBSCRIBED') {
          retries = 0;
          sent = '';
          flushPresence();
          try {
            if (!started) {
              started = true;
              await main.start();
            } else {
              // back after a drop: rows may have changed and events may have been missed
              await loadRows(roomId);
              await main.resync();
            }
            useRoom.setState({ conn: 'live', error: null });
          } catch (e) {
            if (e instanceof Removed) { closed = true; void supabase.removeChannel(ch); useRoom.setState({ conn: 'removed' }); return; }
            useRoom.setState({ conn: 'error', error: (e as Error).message });
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          useRoom.setState({ conn: 'reconnecting', error: err?.message ?? status });
          if (retryTimer) return;
          const wait = Math.min(15_000, 1000 * 2 ** retries++);
          retryTimer = window.setTimeout(() => {
            retryTimer = 0;
            if (closed || gen !== generation) return;
            void join();
          }, wait);
        }
      });
  };
  await join();

  // keep the realtime token fresh when supabase-js refreshes the session
  const { data: authSub } = supabase.auth.onAuthStateChange((_e, s) => { if (s) void supabase.realtime.setAuth(s.access_token); });

  return {
    track: (patch) => { presence = { ...presence, ...patch }; schedulePresence(); },
    onEvent: (fn) => { eventListeners.add(fn); return () => eventListeners.delete(fn); },
    fetchEvents,
    onLaser: (fn) => { laserListeners.add(fn); return () => laserListeners.delete(fn); },
    sendLaser: (p) => { void channel.send({ type: 'broadcast', event: RT.laser, payload: p }); },
    close: () => {
      closed = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(trackTimer);
      authSub.subscription.unsubscribe();
      void supabase.removeChannel(channel);
      if (gen === generation) mainPlayer.reset();
    },
  };
}

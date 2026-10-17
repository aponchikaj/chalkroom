// Room state on this device (Zustand). Rows mirror the DB tables and are kept fresh by
// RowChange broadcasts; stream events drive the board players. Components read from here.
import { create } from 'zustand';
import type {
  ClusterRow, MemberRow, NoteBlockRow, PresenceState, QuestionRow, ReactionRow, ReadyVoteRow,
  RoomRow, RowChange, StreamEvent, ThreadRow,
} from '@chalk/schema';
import { Player } from '../lib/player';

export type ConnState = 'connecting' | 'live' | 'reconnecting' | 'error' | 'removed';

export interface OpenCheck { checkId: string; segment: number; question: StreamEvent<'check'>['data']['question'] }
export type ClosedCheck = StreamEvent<'check_closed'>['data'];

export interface RoomStore {
  me: string | null;
  conn: ConnState;
  error: string | null;
  room: RoomRow | null;
  members: Record<string, MemberRow>;
  presence: Record<string, PresenceState>;
  questions: Record<string, QuestionRow>;
  clusters: Record<string, ClusterRow>;
  threads: Record<string, ThreadRow>;
  readyVotes: ReadyVoteRow[];
  reactions: ReactionRow[];
  notes: Record<string, NoteBlockRow>;
  /** every main-stream event in seq order (rail, notices, catch-up, recap read from here) */
  mainEvents: StreamEvent[];
  check: OpenCheck | null;
  closedChecks: Record<string, ClosedCheck>;
  /** check ids this device answered */
  answered: Record<string, true>;
  /** thread drawer: the thread this device has open, if any */
  openThreadId: string | null;
  /** shape ids selected on the main board (Ask about this, reactions) */
  selection: string[];

  applyRow: (c: RowChange) => void;
  applyMainEvent: (ev: StreamEvent) => void;
  reset: () => void;
}

const initial = {
  conn: 'connecting' as ConnState, error: null, room: null, members: {}, presence: {}, questions: {}, clusters: {},
  threads: {}, readyVotes: [], reactions: [], notes: {}, mainEvents: [], check: null, closedChecks: {}, answered: {}, openThreadId: null, selection: [] as string[],
};

const put = <T>(map: Record<string, T>, key: string, row: T | null) => {
  const next = { ...map };
  if (row) next[key] = row; else delete next[key];
  return next;
};

export const useRoom = create<RoomStore>((set) => ({
  me: null,
  ...initial,

  applyRow: (c) => set((s) => {
    const del = c.op === 'DELETE';
    switch (c.table) {
      case 'rooms': return { room: del ? null : c.row };
      case 'room_members': return {
        members: put(s.members, c.row.user_id, del ? null : c.row),
        // the host removed me: stop showing the class (the database already stopped sharing it)
        ...(c.row.user_id === s.me && c.row.banned ? { conn: 'removed' as ConnState } : {}),
      };
      case 'questions': return { questions: put(s.questions, c.row.id, del ? null : c.row) };
      case 'clusters': return { clusters: put(s.clusters, c.row.id, del ? null : c.row) };
      case 'threads': {
        // the drawer closes on its own when the thread it shows is closed (or deleted)
        const gone = del || c.row.status === 'closed';
        return { threads: put(s.threads, c.row.id, del ? null : c.row), ...(gone && s.openThreadId === c.row.id ? { openThreadId: null } : {}) };
      }
      case 'note_blocks': return { notes: put(s.notes, c.row.id, del ? null : c.row) };
      case 'ready_votes': {
        const same = (v: ReadyVoteRow) => v.segment === c.row.segment && v.user_id === c.row.user_id;
        return { readyVotes: [...s.readyVotes.filter((v) => !same(v)), ...(del ? [] : [c.row])] };
      }
      case 'reactions': {
        const same = (r: ReactionRow) => r.user_id === c.row.user_id && r.shape_id === c.row.shape_id;
        return { reactions: [...s.reactions.filter((r) => !same(r)), ...(del ? [] : [c.row])] };
      }
      case 'check_answers':
        return c.row.user_id === s.me ? { answered: { ...s.answered, [c.row.check_id]: true } } : {};
      default: return {};
    }
  }),

  applyMainEvent: (ev) => set((s) => {
    const mainEvents = [...s.mainEvents, ev];
    if (ev.kind === 'check') {
      const d = ev.data as StreamEvent<'check'>['data'];
      return { mainEvents, check: { checkId: d.checkId, segment: d.segment, question: d.question } };
    }
    if (ev.kind === 'check_closed') {
      const d = ev.data as ClosedCheck;
      return { mainEvents, check: s.check?.checkId === d.checkId ? null : s.check, closedChecks: { ...s.closedChecks, [d.checkId]: d } };
    }
    return { mainEvents };
  }),

  reset: () => set({ ...initial }),
}));

/** The main board player for this device. Thread drawers create their own (silent) players. */
export const mainPlayer = new Player();
// Chrome can keep speaking after the page goes away (reload, a plain link): stop the voice first
window.addEventListener('pagehide', () => mainPlayer.reset());
// dev only: a hot reload makes a new player; the old one must not keep talking unseen
if (import.meta.hot) import.meta.hot.dispose(() => mainPlayer.reset());

// ---- selectors ---------------------------------------------------------------

export const selectActiveMembers = (s: RoomStore) => Object.values(s.members).filter((m) => !m.left_at).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
export const selectPresentMembers = (s: RoomStore) => selectActiveMembers(s).filter((m) => s.presence[m.user_id]);
export const selectIsHost = (s: RoomStore) => !!s.room && s.room.host_id === s.me;
export const selectReadyIds = (s: RoomStore) => new Set(s.readyVotes.filter((v) => v.segment === s.room?.segment).map((v) => v.user_id));
export const selectThreadOf = (s: RoomStore, userId: string) => Object.values(s.threads).find((t) => t.owner_id === userId && t.status === 'open');

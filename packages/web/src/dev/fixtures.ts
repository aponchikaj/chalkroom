// Dev preview fixtures: a believable class of four at any phase, built from the scripted PDA
// lesson. Synthetic data, for design and screenshots only; never shipped to production.
import type {
  ClusterRow, MemberRow, NoteBlockRow, PresenceState, QuestionRow, ReactionRow, ReadyVoteRow, RoomRow, StreamEvent,
  StreamEventDataOf, StreamEventKind, ThreadRow,
} from '@chalk/schema';
import { PublicQuestion, correctAnswerText } from '@chalk/schema';
import { PDA_PLAN, PDA_SEGMENTS, mockClusterAnswer, mockSummary, mockThreadReply } from '@chalk/mock-tutor';

export type DevState = 'lobby' | 'teaching' | 'check' | 'result' | 'qa' | 'offer' | 'thread' | 'catchup' | 'ended';
export const DEV_STATES: DevState[] = ['lobby', 'teaching', 'check', 'result', 'qa', 'offer', 'thread', 'catchup', 'ended'];

export const ROOM_ID = '00000000-0000-4000-8000-0000000000aa';
export const MAIN = '00000000-0000-4000-8000-0000000000bb';
export const THREAD_STREAM = '00000000-0000-4000-8000-0000000000cc';
export const USERS = {
  ana: { id: 'u-ana', name: 'Ana', color: '#f2d16b' },
  nika: { id: 'u-nika', name: 'Nika', color: '#8fc7e8' },
  gio: { id: 'u-gio', name: 'Gio', color: '#a8dc9f' },
  mari: { id: 'u-mari', name: 'Mari', color: '#f4a6c8' },
} as const;
export type DevUser = keyof typeof USERS;

const T0 = Date.parse('2026-10-18T10:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

export function makeEvents() {
  let seq = 0;
  const main: StreamEvent[] = [];
  const thread: StreamEvent[] = [];
  const push = <K extends StreamEventKind>(into: StreamEvent[], stream: string, kind: K, data: StreamEventDataOf<K>, min: number, actor = 'lead') => {
    const ev = { stream_id: stream, room_id: ROOM_ID, seq: into === main ? ++seq : into.length + 1, kind, data, actor, t: at(min) } as StreamEvent;
    into.push(ev);
    return ev;
  };
  const m = <K extends StreamEventKind>(kind: K, data: StreamEventDataOf<K>, min: number, actor?: string) => push(main, MAIN, kind, data, min, actor);
  return { main, thread, m, t: <K extends StreamEventKind>(kind: K, data: StreamEventDataOf<K>, min: number, actor?: string) => push(thread, THREAD_STREAM, kind, data, min, actor) };
}

/** Teach segment n into the event list, starting at minute `start`. */
function teach(e: ReturnType<typeof makeEvents>, n: number, start: number, withCheck: boolean) {
  const seg = PDA_SEGMENTS[n];
  e.m('segment_start', { segment: n, title: seg.title }, start);
  let chunk: typeof seg.steps = [];
  let minute = start;
  for (const step of seg.steps) {
    chunk.push(step);
    if ('say' in step) { e.m('board', { steps: chunk }, (minute += 0.3)); chunk = []; }
  }
  if (chunk.length) e.m('board', { steps: chunk }, (minute += 0.3));
  if (withCheck && seg.check) e.m('check', { checkId: `check-${n}`, segment: n, question: PublicQuestion.parse(seg.check) }, (minute += 0.2));
  return minute;
}

function closeCheck(e: ReturnType<typeof makeEvents>, n: number, minute: number, counts: Record<string, number>, correct: number) {
  const q = PDA_SEGMENTS[n].check!;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  e.m('check_closed', { checkId: `check-${n}`, spread: { total, correct, counts }, answer: q.answer, answerText: correctAnswerText(q), explanation: q.explanation }, minute);
}

export interface Fixture {
  me: string;
  room: RoomRow;
  members: Record<string, MemberRow>;
  presence: Record<string, PresenceState>;
  questions: Record<string, QuestionRow>;
  clusters: Record<string, ClusterRow>;
  threads: Record<string, ThreadRow>;
  readyVotes: ReadyVoteRow[];
  reactions: ReactionRow[];
  notes: Record<string, NoteBlockRow>;
  mainEvents: StreamEvent[];
  threadEvents: StreamEvent[];
  answered: Record<string, true>;
  openThreadId: string | null;
  /** caption to show as if the tutor were mid-sentence */
  caption: string;
}

export function buildFixture(state: DevState, who: DevUser): Fixture {
  const me = USERS[who].id;
  const e = makeEvents();
  let segment = 0;
  let phase: RoomRow['phase'] = 'lobby';
  let caption = '';
  const answered: Record<string, true> = {};

  if (state !== 'lobby') {
    let minute = teach(e, 0, 1, true);
    if (state === 'teaching') {
      phase = 'teaching';
      e.main.pop(); // the check has not arrived yet
      caption = 'Because the result lies off the curve, no private key exists for it.';
    } else if (state === 'check') {
      phase = 'check';
      e.m('segment_end', { segment: 0 }, (minute += 0.1));
      answered['check-0'] = true;
    } else {
      e.m('segment_end', { segment: 0 }, (minute += 0.1));
      e.m('segment_summary', { segment: 0, title: PDA_SEGMENTS[0].title, summary: mockSummary(PDA_SEGMENTS[0].title) }, (minute += 0.2), 'scribe');
      closeCheck(e, 0, (minute += 1), { '1': 3, '0': 1 }, 3);
      answered['check-0'] = true;
      if (state === 'result') phase = 'qa';
      if (state === 'qa' || state === 'offer' || state === 'thread' || state === 'catchup' || state === 'ended') {
        e.m('answer_cluster', { clusterId: 'c-sign', title: 'Why can a PDA not sign?', askers: ['Gio', 'Mari'], steps: mockClusterAnswer('Why can a PDA not sign?', ['Gio', 'Mari']) }, (minute += 0.5));
        phase = 'qa';
      }
      if (state === 'thread' || state === 'catchup' || state === 'ended') {
        segment = 1;
        phase = 'teaching';
        minute = teach(e, 1, minute + 0.5, false);
        caption = 'About half the time the very first try works.';
      }
      if (state === 'catchup' || state === 'ended') {
        e.m('segment_end', { segment: 1 }, (minute += 0.1));
        e.m('segment_summary', { segment: 1, title: PDA_SEGMENTS[1].title, summary: mockSummary(PDA_SEGMENTS[1].title) }, (minute += 0.2), 'scribe');
        segment = 2;
        minute = teach(e, 2, minute + 0.3, true);
        phase = 'check';
        caption = '';
      }
      if (state === 'ended') {
        closeCheck(e, 2, (minute += 1), { '{"value":false}': 4 }, 4);
        e.m('notice', { text: 'Class ended. Thanks for learning together!', level: 'info' }, (minute += 0.2), 'system');
        phase = 'ended';
      }
    }
  }

  // thread for Nika on bump seeds
  const threadOpen = state === 'thread';
  const threadOffered = state === 'offer';
  const threadClosed = state === 'catchup' || state === 'ended';
  if (threadOpen || threadClosed) {
    const r1 = mockThreadReply('how is the bump seed chosen exactly?');
    e.t('chat', { role: 'learner', markdown: 'How is the bump seed chosen exactly?', authorId: USERS.nika.id }, 9, USERS.nika.id);
    e.t('chat', { role: 'tutor', markdown: r1.markdown }, 9.2, 'thread');
    e.t('board', { steps: [
      { add: { id: 'tb-255', kind: 'box', text: 'bump 255\non curve', at: [2, 2] } },
      { add: { id: 'tb-254', kind: 'box', text: 'bump 254\non curve', at: [5.5, 2] } },
      { add: { id: 'tb-253', kind: 'box', text: 'bump 253\noff curve', at: [9, 2], style: 'good' } },
      { add: { id: 'tb-a1', kind: 'arrow', from: 'tb-255', to: 'tb-254' } },
      { add: { id: 'tb-a2', kind: 'arrow', from: 'tb-254', to: 'tb-253' } },
      { say: 'It counts down until the hash lands off the curve.' },
    ] }, 9.3, 'thread');
    e.t('chat', { role: 'learner', markdown: 'So the program stores the bump to avoid searching again?', authorId: USERS.nika.id }, 10, USERS.nika.id);
    e.t('chat', { role: 'tutor', markdown: 'Exactly. Store the **canonical bump** in the account and pass it back, so `invoke_signed` never has to search.' }, 10.2, 'thread');
  }

  const mainSeq = e.main.length;
  const room: RoomRow = {
    id: ROOM_ID, course_id: null, topic_id: 'pdas', title: 'Solana PDAs', goal: '', host_id: USERS.ana.id,
    phase, segment, visibility: 'private', seats: 5, invite_code: 'KPXCNK', lesson_plan: state === 'lobby' ? null : PDA_PLAN,
    main_stream_id: MAIN, gate_deadline: phase === 'check' ? new Date(Date.now() + 41_000).toISOString() : null, gate_held: false,
    created_at: at(0), started_at: state === 'lobby' ? null : at(1), ended_at: state === 'ended' ? at(30) : null,
  };

  const order: DevUser[] = state === 'lobby' ? ['ana', 'nika', 'gio'] : ['ana', 'nika', 'gio', 'mari'];
  const members: Record<string, MemberRow> = {};
  const presence: Record<string, PresenceState> = {};
  order.forEach((k, i) => {
    const u = USERS[k];
    members[u.id] = { room_id: ROOM_ID, user_id: u.id, role: k === 'ana' ? 'host' : 'learner', display_name: u.name, color: u.color, joined_at: at(i * 0.1), left_at: null };
    presence[u.id] = { userId: u.id, name: u.name, color: u.color, threadId: k === 'nika' && threadOpen ? 'th-bump' : null, typing: false, editing: null, onlineAt: at(i * 0.1) };
  });
  if (state === 'teaching') presence[USERS.mari.id] = { ...presence[USERS.mari.id], typing: true };
  if (state === 'check') delete presence[USERS.gio.id]; // Gio's laptop went to sleep

  const q = (id: string, author: DevUser, text: string, cluster: string | null, status: QuestionRow['status'], min: number, votes = 0): QuestionRow => ({
    id, room_id: ROOM_ID, author_id: USERS[author].id, author_name: USERS[author].name, text, anchor: null, segment: 0,
    cluster_id: cluster, status, votes, created_at: at(min),
  });
  const questions: Record<string, QuestionRow> = {};
  const clusters: Record<string, ClusterRow> = {};
  if (state !== 'lobby') {
    const qs = [
      q('q1', 'gio', 'Why can a PDA not sign transactions?', 'c-sign', 'grouped', 3, 1),
      q('q2', 'mari', 'why cant a PDA sign for itself', 'c-sign', 'grouped', 3.4),
      q('q3', 'nika', 'What is a bump seed?', 'c-bump', 'later', 4),
      q('q4', 'ana', 'Is the program id part of the hash?', 'c-pid', 'answered', 4.5),
    ];
    if (state === 'teaching') qs.push(q('q5', 'mari', 'Can two programs derive the same PDA?', null, 'pending', 5.8));
    if (state !== 'teaching' && state !== 'check') qs.push(q('q6', 'nika', 'How is the bump seed chosen exactly?', 'c-thread', 'thread', 8));
    for (const x of qs) questions[x.id] = x;
    const c = (id: string, title: string, route: ClusterRow['route'], askers: number, extra: Partial<ClusterRow> = {}): ClusterRow => ({
      id, room_id: ROOM_ID, title, route, reason: null, target_segment: null, answer: null, answered: false, asker_count: askers, created_at: at(3), ...extra,
    });
    clusters['c-sign'] = c('c-sign', 'Why can a PDA not sign?', 'class', 2, { reason: '2 askers, core objective', answered: phase !== 'teaching' && phase !== 'check' });
    clusters['c-bump'] = c('c-bump', 'What is a bump seed?', 'later', 1, { target_segment: 1 });
    clusters['c-pid'] = c('c-pid', 'Is the program id part of the hash?', 'inline', 1, { answer: 'Yes. The program id is hashed together with the seeds and the bump, so the same seeds give a different PDA under another program.' });
    if (questions.q6) clusters['c-thread'] = c('c-thread', 'How is the bump seed chosen?', 'thread', 1, { reason: "Nika's third question on bump seeds" });
  }

  const threads: Record<string, ThreadRow> = {};
  if (threadOffered) {
    threads['th-bump'] = { id: 'th-bump', room_id: ROOM_ID, owner_id: USERS.nika.id, stream_id: THREAD_STREAM, topic: 'Bump seeds', status: 'offered', shared_answer: null, left_main_seq: null, created_at: at(8.8) };
  }
  if (threadOpen || threadClosed) {
    threads['th-bump'] = { id: 'th-bump', room_id: ROOM_ID, owner_id: USERS.nika.id, stream_id: THREAD_STREAM, topic: 'Bump seeds', status: threadOpen ? 'open' : 'closed', shared_answer: null, left_main_seq: threadClosed ? mainSeq - 9 : 12, created_at: at(8.8) };
  }

  const readyVotes: ReadyVoteRow[] = phase === 'check' ? [USERS.ana, USERS.mari].map((u) => ({ room_id: ROOM_ID, segment, user_id: u.id, created_at: at(9) })) : [];
  const reactions: ReactionRow[] = state === 'teaching' || state === 'check' ? [
    { room_id: ROOM_ID, user_id: USERS.gio.id, shape_id: 'pda', kind: 'confused', created_at: at(4) },
    { room_id: ROOM_ID, user_id: USERS.mari.id, shape_id: 'pda', kind: 'confused', created_at: at(4.2) },
    { room_id: ROOM_ID, user_id: USERS.nika.id, shape_id: 'f1', kind: 'got_it', created_at: at(4.4) },
  ] : [];

  const notes: Record<string, NoteBlockRow> = {};
  if (state !== 'lobby' && state !== 'teaching') {
    const blocks = [
      '## What is a PDA?\nA **Program Derived Address** is derived from seeds and the program id. It lies off the ed25519 curve, so **no private key exists**.\n\n$$\\text{PDA} = H(\\text{seeds}, \\text{programId}, \\text{bump})$$',
      '## Finding the bump\n`find_program_address` tries bump 255, then 254, and so on, until the hash lands off the curve. About half the time the first try works.',
      '## Signing with invoke_signed\nThe runtime re-derives the PDA from the seeds; if it matches, the PDA counts as a signer.',
    ];
    blocks.slice(0, state === 'ended' ? 3 : 1).forEach((markdown, idx) => {
      notes[`n${idx}`] = { id: `n${idx}`, room_id: ROOM_ID, idx, markdown, edited_by: idx === 0 && state === 'ended' ? USERS.gio.id : null, version: 1, updated_at: at(20 + idx) };
    });
    if (state === 'ended') presence[USERS.gio.id] = { ...presence[USERS.gio.id], editing: 'n1' };
  }

  return {
    me, room, members, presence, questions, clusters, threads, readyVotes, reactions, notes,
    mainEvents: e.main, threadEvents: e.thread, answered,
    openThreadId: threadOpen && who === 'nika' ? 'th-bump' : null,
    caption,
  };
}

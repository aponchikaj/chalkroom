// Lane M: the live activity in play, derived from the main stream (the store appends every
// main-stream event). Only the latest activity counts; one runs at a time per room.
import type { StreamEvent, StreamEventDataOf } from '@chalk/schema';

type Kind = 'duel_start' | 'duel_question' | 'duel_result' | 'duel_end' | 'teachback_invite' | 'teachback_volunteer' | 'teachback_explanation' | 'teachback_feedback';
type D<K extends Kind> = StreamEventDataOf<K>;
function dataOf<K extends Kind>(e: StreamEvent, k: K): D<K> | null {
  return e.kind === k ? (e.data as D<K>) : null;
}

/** after the server's clock ran out, a little slack before the web gives up on an activity */
const SLACK_MS = 15_000;
const TB_VOLUNTEER_MS = 60_000;
const TB_EXPLAIN_MS = 180_000;
const TB_FEEDBACK_MS = 120_000;

export interface DuelView {
  kind: 'duel';
  id: string;
  count: number;
  seconds: number;
  /** the open question, if any */
  question: (D<'duel_question'> & { t: string }) | null;
  /** the latest result (for the open question's predecessor or the one just closed) */
  result: D<'duel_result'> | null;
  /** results so far, by index */
  results: D<'duel_result'>[];
  end: D<'duel_end'> | null;
  /** the questions asked, by index (for the result's prompt and options) */
  asked: Record<number, D<'duel_question'>>;
  /** seq of the last event of this activity */
  lastSeq: number;
  /** the class moved on after the end (fold it away) */
  movedOn: boolean;
  stale: boolean;
}

export interface TeachbackView {
  kind: 'teachback';
  id: string;
  concept: string;
  prompt: string;
  invitedAt: number;
  volunteer: (D<'teachback_volunteer'> & { at: number }) | null;
  explanation: (D<'teachback_explanation'> & { at: number }) | null;
  feedback: D<'teachback_feedback'> | null;
  movedOn: boolean;
  /** timed out (the server ended it with a notice) or lost to a restart */
  stale: boolean;
}

export type ActivityView = DuelView | TeachbackView;

const MOVE_ON = new Set(['segment_start', 'answer_cluster', 'check_closed']);

export function currentActivity(events: StreamEvent[], now: number): ActivityView | null {
  let start = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === 'duel_start' || events[i].kind === 'teachback_invite') { start = i; break; }
  }
  if (start < 0) return null;
  const first = events[start];
  const after = events.slice(start + 1);

  if (first.kind === 'duel_start') {
    const s = first.data as D<'duel_start'>;
    const v: DuelView = { kind: 'duel', id: s.duelId, count: s.count, seconds: s.secondsPerQuestion, question: null, result: null, results: [], end: null, asked: {}, lastSeq: first.seq, movedOn: false, stale: false };
    let endIdx = -1;
    let lastT = Date.parse(first.t);
    after.forEach((e, i) => {
      const q = dataOf(e, 'duel_question');
      if (q && q.duelId === v.id) { v.asked[q.index] = q; v.question = { ...q, t: e.t }; v.lastSeq = e.seq; lastT = Date.parse(e.t); }
      const r = dataOf(e, 'duel_result');
      if (r && r.duelId === v.id) { v.results[r.index] = r; v.result = r; if (v.question?.index === r.index) v.question = null; v.lastSeq = e.seq; lastT = Date.parse(e.t); }
      const end = dataOf(e, 'duel_end');
      if (end && end.duelId === v.id) { v.end = end; v.question = null; v.lastSeq = e.seq; endIdx = i; }
    });
    if (v.end) v.movedOn = after.slice(endIdx + 1).some((e) => MOVE_ON.has(e.kind));
    else if (v.question) v.stale = now > Date.parse(v.question.endsAt) + SLACK_MS;
    else v.stale = now > lastT + 30_000 + SLACK_MS; // between questions the pause is a few seconds
    return v;
  }

  const inv = first.data as D<'teachback_invite'>;
  const v: TeachbackView = { kind: 'teachback', id: inv.teachbackId, concept: inv.concept, prompt: inv.prompt, invitedAt: Date.parse(first.t), volunteer: null, explanation: null, feedback: null, movedOn: false, stale: false };
  let fbIdx = -1;
  after.forEach((e, i) => {
    const vol = dataOf(e, 'teachback_volunteer');
    if (vol && vol.teachbackId === v.id) v.volunteer = { ...vol, at: Date.parse(e.t) };
    const ex = dataOf(e, 'teachback_explanation');
    if (ex && ex.teachbackId === v.id) v.explanation = { ...ex, at: Date.parse(e.t) };
    const fb = dataOf(e, 'teachback_feedback');
    if (fb && fb.teachbackId === v.id) { v.feedback = fb; fbIdx = i; }
  });
  if (v.feedback) v.movedOn = after.slice(fbIdx + 1).some((e) => MOVE_ON.has(e.kind));
  else if (v.explanation) v.stale = now > v.explanation.at + TB_FEEDBACK_MS;
  else if (v.volunteer) v.stale = now > v.volunteer.at + TB_EXPLAIN_MS + 2_000;
  else v.stale = now > v.invitedAt + TB_VOLUNTEER_MS + 2_000;
  return v;
}

/** An activity is running (the host cannot start another) unless it ended or went stale. */
export function isRunning(a: ActivityView | null): boolean {
  if (!a || a.stale) return false;
  return a.kind === 'duel' ? !a.end : !a.feedback;
}

export const deadlineOf = (a: TeachbackView): number | null =>
  a.explanation ? null : a.volunteer ? a.volunteer.at + TB_EXPLAIN_MS : a.invitedAt + TB_VOLUNTEER_MS;

/** time left on the teach-back clock, never above its window (device clocks drift a little) */
export const timeLeft = (a: TeachbackView, now: number): number => {
  const d = deadlineOf(a);
  if (d === null) return 0;
  return Math.min(a.volunteer ? TB_EXPLAIN_MS : TB_VOLUNTEER_MS, d - now);
};

/** "0:42" */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

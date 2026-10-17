// Lane M: the quiz duel as a plain, timer-driven sequence (no Nest, no database), so the rules
// can be tested with fake timers. ActivitiesService gives it a way to write events and to see
// who is in the room.
//
//   duel_start -> (duel_question -> answers until time is up or everyone present answered
//                  -> duel_result -> short pause) x N -> duel_end
//
// Scoring: a wrong answer scores 0. A right one scores between 500 and 1000 points by speed:
//   points = round(score * 1000 * (0.5 + 0.5 * remaining / total))
// where remaining is the time left when the answer arrived and score is gradeItem's 0..1.
// Answering at the last moment still earns half, so a slow right answer beats a fast wrong one.
import { PublicQuestion, correctAnswerText, gradeItem, type CheckSpread, type Question, type StreamEventDataOf } from '@chalk/schema';

export const DUEL = {
  /** answers arriving this long after endsAt still count (network latency) */
  graceMs: 750,
  /** how long the class sees a result before the next question */
  resultMs: 5_000,
  maxPoints: 1000,
};

export interface Leader { userId: string; name: string; points: number }

export interface DuelDeps {
  emit: <K extends 'duel_start' | 'duel_question' | 'duel_result' | 'duel_end'>(kind: K, data: StreamEventDataOf<K>) => Promise<void>;
  /** user ids of the people in the room right now (presence-aware) */
  present: () => Promise<string[]>;
  /** display name of a member */
  nameOf: (userId: string) => string;
  /** false when the class moved on (host skipped the gate): the duel ends early */
  stillOn?: () => Promise<boolean>;
  now?: () => number;
}

/** Points for one graded answer (see the header). */
export function scoreAnswer(score: number, answeredAt: number, openedAt: number, endsAt: number): number {
  if (score <= 0) return 0;
  const total = Math.max(1, endsAt - openedAt);
  const remaining = Math.min(total, Math.max(0, endsAt - answeredAt));
  return Math.round(Math.min(1, score) * DUEL.maxPoints * (0.5 + 0.5 * (remaining / total)));
}

/** Same keys as the class check spread: mcq index, "true"/"false", the typed number. */
export const answerKey = (a: unknown) => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a).trim());

export function spreadOf(answers: { answer: unknown; correct: boolean }[]): CheckSpread {
  const counts: Record<string, number> = {};
  for (const a of answers) { const k = answerKey(a.answer); counts[k] = (counts[k] ?? 0) + 1; }
  return { total: answers.length, correct: answers.filter((a) => a.correct).length, counts };
}

export function leaderboard(points: Map<string, number>, nameOf: (id: string) => string): Leader[] {
  return [...points].map(([userId, p]) => ({ userId, name: nameOf(userId), points: p }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/** The concept of the question the class missed most (lowest share right); none if all were right. */
export function mostMissed(results: { question: Question; spread: CheckSpread }[]): string | undefined {
  let worst: { share: number; q: Question } | null = null;
  for (const r of results) {
    if (!r.spread.total) continue;
    const share = r.spread.correct / r.spread.total;
    if (share >= 1) continue;
    if (!worst || share < worst.share) worst = { share, q: r.question };
  }
  return worst ? (worst.q.topic || worst.q.prompt).slice(0, 200) : undefined;
}

interface Answer { answer: unknown; correct: boolean; points: number }

export class DuelRun {
  readonly id: string;
  private index = -1;
  private openedAt = 0;
  private endsAt = 0;
  private answers = new Map<string, Answer>();
  private points = new Map<string, number>();
  private wake: (() => void) | null = null;
  private stopped = false;
  private now: () => number;

  constructor(id: string, readonly questions: Question[], readonly seconds: number, private deps: DuelDeps) {
    this.id = id;
    this.now = deps.now ?? Date.now;
  }

  get current() { return this.index; }

  /** Run the whole duel. Resolves after duel_end. */
  async run(): Promise<void> {
    const { emit } = this.deps;
    // everyone present starts on the board at 0
    for (const id of await this.deps.present()) this.points.set(id, 0);
    await emit('duel_start', { duelId: this.id, count: this.questions.length, secondsPerQuestion: this.seconds });
    const results: { question: Question; spread: CheckSpread }[] = [];
    for (let i = 0; i < this.questions.length && !this.stopped; i++) {
      if (this.deps.stillOn && !(await this.deps.stillOn())) break;
      const q = this.questions[i];
      this.answers = new Map();
      this.openedAt = this.now();
      this.endsAt = this.openedAt + this.seconds * 1000;
      this.index = i;
      await emit('duel_question', { duelId: this.id, index: i, question: PublicQuestion.parse(q), endsAt: new Date(this.endsAt).toISOString() });
      await this.waitForAnswers();
      this.index = -1; // closed: late answers are refused
      const spread = spreadOf([...this.answers.values()]);
      results.push({ question: q, spread });
      await emit('duel_result', {
        duelId: this.id, index: i, spread, answer: q.answer, answerText: correctAnswerText(q), leaders: this.leaders(),
      });
      if (i < this.questions.length - 1 && !this.stopped) await this.sleep(DUEL.resultMs);
    }
    await emit('duel_end', { duelId: this.id, leaders: this.leaders(), reteach: mostMissed(results) });
  }

  /** End the duel at the next step (the class moved on). */
  stop() { this.stopped = true; this.wake?.(); }

  /**
   * Record one answer. Returns an error word for the controller, or null when it counted.
   * One answer per person per question; only while the question is open.
   */
  async answer(userId: string, index: number, answer: unknown): Promise<'closed' | 'twice' | null> {
    const at = this.now();
    if (index !== this.index || at > this.endsAt + DUEL.graceMs) return 'closed';
    if (this.answers.has(userId)) return 'twice';
    const q = this.questions[index];
    const g = gradeItem(q, answer);
    const correct = g.score >= g.max;
    const points = scoreAnswer(g.score, at, this.openedAt, this.endsAt);
    this.answers.set(userId, { answer, correct, points });
    this.points.set(userId, (this.points.get(userId) ?? 0) + points);
    // close early once everyone in the room has answered
    const present = await this.deps.present();
    if (index === this.index && present.length && present.every((id) => this.answers.has(id))) this.wake?.();
    return null;
  }

  private leaders() { return leaderboard(this.points, this.deps.nameOf); }

  private waitForAnswers() {
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, Math.max(0, this.endsAt - this.now()));
      const self = this;
      function done() { clearTimeout(t); self.wake = null; resolve(); }
      this.wake = done;
    });
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      const self = this;
      function done() { clearTimeout(t); self.wake = null; resolve(); }
      this.wake = done;
    });
  }
}

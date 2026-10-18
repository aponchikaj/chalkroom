// RoomConductor: a per-room actor. Every phase change runs on one serial queue, so two
// requests can never move the same room at once. The phase lives in rooms.phase, so a
// restarted API resumes from the database (see recover()).
//
//   lobby ─start→ teaching ─segment ends→ check ─gate passes→ qa ─→ teaching (next) … → ended
//
// Gate passes when every present learner who is not in a thread is ready, OR 60 s after the
// first ready vote, OR the host skips. Hold pauses the gate.
//
// Model failures (there is no scripted tutor): a segment is retried with backoff while nothing
// of it is on the board. If it still fails, or the room reached its token budget, the class
// holds at the gate with a notice; the host's Resume teaches the segment again, Skip moves on
// and End ends the class.
import { Logger } from '@nestjs/common';
import { LIVE, PublicQuestion, correctAnswerText, type CheckSpread, type Question, type RoomRow } from '@chalk/schema';
import type { SupabaseService } from '../core/supabase.service';
import type { EventsService } from '../core/events.service';
import type { RoomsService } from '../rooms/rooms.service';
import type { LeadTutorAgent } from '../agents/lead-tutor.agent';
import type { TriageService } from '../triage/triage.service';
import { FALLBACK_ANSWER } from '../triage/triage-plan';
import { FAQ_REASON } from '../triage/faq-match';
import type { ScribeAgent } from '../agents/scribe.agent';
import type { RetrieveService } from '../rag/retrieve.service';
import type { IngestWorker } from '../rag/ingest.worker';
import { keepKnownCitations } from '../rag/citations';
import { citation } from '@chalk/schema';
import { checkResults, segmentTranscript, summariesOf } from './narration';
import { buildNotes } from '../notes/notes';
import { prefetch, type ChunkBuffer } from './prefetch';
import { config } from '../config';
import type { TeachChunk } from '../agents/lead-tutor.agent';
import { BudgetExceeded } from '../agents/metered.model';

export const TEACH_FAILED = 'The tutor could not continue. The host can press Resume to try again.';
export const BUDGET_REACHED = 'This class reached its AI budget, so the tutor has stopped. The host can end the class.';
/** waits before the 2nd and 3rd try of a failed segment */
export const RETRY_DELAYS_MS = [2_000, 6_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ConductorDeps {
  supa: SupabaseService;
  events: EventsService;
  rooms: RoomsService;
  lead: LeadTutorAgent;
  triage: TriageService;
  scribe: ScribeAgent;
  retrieve: RetrieveService;
  ingest: IngestWorker;
  /** this instance holds the room's lease (room_leases): only then may it move the room */
  owns: (roomId: string) => Promise<boolean>;
  /** the class ended: the service frees this conductor */
  ended: (roomId: string) => void;
  /** waits between tries of a failed segment (tests pass zeros); default RETRY_DELAYS_MS */
  retryDelaysMs?: number[];
}

export type HostAction = 'skip' | 'hold' | 'resume' | 'slower' | 'end';

export class RoomConductor {
  private log: Logger;
  private queue: Promise<unknown> = Promise.resolve();
  private gateTimer: ReturnType<typeof setTimeout> | null = null;
  /** host pressed Slower: the next segment re-explains with smaller steps */
  private slower = false;
  private summaries: string[] = [];
  private lastCheck?: { prompt: string; spread: CheckSpread; answerText: string };
  /** the scribe's summary of the last finished segment; awaited before the next segment */
  private pendingSummary: Promise<void> = Promise.resolve();
  /** the host pressed End: the segment being streamed stops at its next chunk */
  private stopping = false;
  /** jobs queued or running; 0 = idle (the heartbeat may let an idle, non-live room go) */
  private pending = 0;
  /** the API is shutting down: no new jobs */
  private closed = false;
  /** the next segment, written while the class is at the gate (pipelining) */
  private next: { segment: number; chunks: ChunkBuffer<TeachChunk> } | null = null;
  /** the segment the tutor could not teach: the host's Resume teaches it again */
  private failed: number | null = null;

  constructor(readonly roomId: string, private deps: ConductorDeps) {
    this.log = new Logger(`Room ${roomId.slice(0, 8)}`);
  }

  // -------------------------------------------------------------------------
  // Public API (each call is queued; callers do not wait for teaching to finish)
  // -------------------------------------------------------------------------

  start() { return this.enqueue('start', () => this.doStart()); }
  readyChanged() { return this.enqueue('gate', () => this.evaluateGate()); }
  membersChanged() { return this.enqueue('gate', () => this.evaluateGate()); }
  /** heartbeat: votes that reached another instance still move the gate */
  tick() { return this.enqueue('gate', () => this.evaluateGate()); }
  host(action: HostAction) {
    // End must not wait behind a 2-4 minute segment: stop the stream now, then end in order
    if (action === 'end') { this.stopping = true; this.next?.chunks.cancel(); }
    return this.enqueue(`host:${action}`, () => this.doHost(action));
  }
  recover() { return this.enqueue('recover', () => this.doRecover()); }

  get idle() { return this.pending === 0; }

  /** Shutdown: stop the stream being taught and the gate timer, and take no more jobs. */
  shutdown() {
    this.closed = true;
    this.stopping = true;
    if (this.gateTimer) { clearTimeout(this.gateTimer); this.gateTimer = null; }
    this.next?.chunks.cancel();
    this.next = null;
  }

  // -------------------------------------------------------------------------

  private enqueue<T>(what: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (this.closed) return Promise.resolve(undefined);
    this.pending++;
    const p = this.queue.then(async () => {
      if (this.closed) return undefined;
      // another instance drives this room: it reads the same rows and moves the room itself
      if (!(await this.deps.owns(this.roomId))) return undefined;
      return fn();
    });
    this.queue = p.catch(async (e) => {
      this.log.error(`${what} failed: ${(e as Error).stack ?? e}`);
      await this.rescue(what).catch((e2) => this.log.error(`rescue failed: ${(e2 as Error).message}`));
    });
    const done = () => { this.pending--; };
    void this.queue.then(done, done);
    return p;
  }

  /** A job threw (a database blip, an invalid event): never leave the class frozen. Teaching or
   *  Q&A go back to the gate, where ready votes and Skip work again; a failed start stays in the
   *  lobby so the host can press Start again. */
  private async rescue(what: string) {
    const room = await this.deps.rooms.get(this.roomId);
    if (room.phase === 'lobby' && what === 'start') {
      return this.notice(room, 'The class could not start. Press Start to try again.', 'warn');
    }
    if (room.phase === 'teaching' || room.phase === 'qa') {
      await this.deps.rooms.update(room.id, { phase: 'check', gate_deadline: null });
      await this.notice(room, 'The tutor hit a problem; vote ready to go on, or the host can skip.', 'warn');
    }
  }

  private get db() { return this.deps.supa.db; }

  private prefix(room: RoomRow) { return this.deps.rooms.prefixOf(room); }

  private async notice(room: RoomRow, text: string, level: 'info' | 'warn' = 'info') {
    await this.deps.events.append(room.main_stream_id, 'notice', { text, level }, 'system');
  }

  private async doStart() {
    let room = await this.deps.rooms.get(this.roomId);
    if (room.phase !== 'lobby') return;
    await this.indexSyllabus(room);
    const prefix = await this.prefix(room);
    const plan = await this.withRetry('plan', () => this.deps.lead.plan(prefix, room.title, room.id));
    room = await this.deps.rooms.update(room.id, { lesson_plan: plan, started_at: new Date().toISOString() });
    await this.teach(room, 0);
  }

  private async teach(room: RoomRow, segment: number) {
    const plan = room.lesson_plan!;
    room = await this.deps.rooms.update(room.id, { phase: 'teaching', segment, gate_deadline: null });
    const main = room.main_stream_id;
    await this.deps.events.append(main, 'segment_start', { segment, title: plan.segments[segment].title }, 'lead');
    const slower = this.slower;
    this.slower = false;
    let drawn = 0;
    const known = await this.deps.retrieve.known(room);
    const run = async (source: AsyncIterable<TeachChunk>) => {
      for await (const chunk of source) {
        if (this.stopping) return; // leaving the loop closes the model stream
        drawn++;
        if ('steps' in chunk) await this.deps.events.append(main, 'board', { steps: keepKnownCitations(chunk.steps, known) }, 'lead');
        else if ('check' in chunk) {
          const row = await this.db.from('checks').insert({ room_id: room.id, segment, question: chunk.check }).select('id').single();
          if (row.error) throw new Error(row.error.message);
          await this.deps.events.append(main, 'check', { checkId: row.data.id, segment, question: PublicQuestion.parse(chunk.check) }, 'lead');
        }
      }
    };
    // tries while nothing is drawn; once learners saw part of the segment, a retry would draw it
    // twice, so the class holds and the host decides (Resume teaches it again from the start)
    const delays = this.deps.retryDelaysMs ?? RETRY_DELAYS_MS;
    let source: AsyncIterable<TeachChunk> | null = this.takePrefetch(segment, slower);
    let simple = false;
    let failure: 'error' | 'budget' | null = null;
    for (let attempt = 0; ; attempt++) {
      try {
        await run(source ?? this.deps.lead.teach({ ...(await this.teachContext(room, segment, slower)), simple }));
        break;
      } catch (e) {
        const msg = (e as Error).message;
        this.log.error(`teach ${segment} (try ${attempt + 1}): ${msg}`);
        if (this.stopping) break;
        if (e instanceof BudgetExceeded) { failure = 'budget'; break; }
        if (drawn || attempt >= delays.length) { failure = 'error'; break; }
        // B6: Board Script still invalid after the repair pass: the next try keeps to simple steps
        if (/invalid teach_segment/.test(msg)) simple = true;
        source = null;
        await sleep(delays[attempt]);
        if (this.stopping) break;
      }
    }
    if (failure) return this.holdFailed(room, segment, failure);
    await this.deps.events.append(main, 'segment_end', { segment }, 'lead');
    // the summary runs beside the gate, never in front of it
    this.pendingSummary = this.summarize(room, segment, plan.segments[segment].title);
    // pipelining: write the next segment while the class answers the check and votes
    // the gate opens first; the next segment's retrieval and writing run behind it
    await this.deps.rooms.update(room.id, { phase: 'check' });
    if (config.pipeline && segment + 1 < plan.segments.length && !this.stopping) {
      this.next = { segment: segment + 1, chunks: prefetch(this.deps.lead.teach(await this.teachContext(room, segment + 1, false))) };
    }
    // a separate job, not inline: a host command queued meanwhile (End, Hold) runs first, and a
    // class whose learners are all in threads cannot run the whole lesson in one job
    void this.enqueue('gate', () => this.evaluateGate());
  }

  /** The tutor could not teach `segment`: close it, hold the class at the gate and say so. The
   *  host's Resume teaches the segment again; Skip moves on; End ends the class. */
  private async holdFailed(room: RoomRow, segment: number, failure: 'error' | 'budget') {
    this.failed = segment;
    if (this.gateTimer) { clearTimeout(this.gateTimer); this.gateTimer = null; }
    this.next?.chunks.cancel();
    this.next = null;
    await this.deps.events.append(room.main_stream_id, 'segment_end', { segment }, 'lead');
    await this.deps.rooms.update(room.id, { phase: 'check', gate_held: true, gate_deadline: null });
    await this.notice(room, failure === 'budget' ? BUDGET_REACHED : TEACH_FAILED, 'warn');
  }

  /** A model call with the segment retry policy (lesson planning). Budget errors are final. */
  private async withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
    const delays = this.deps.retryDelaysMs ?? RETRY_DELAYS_MS;
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof BudgetExceeded || attempt >= delays.length || this.stopping) throw e;
        this.log.warn(`${what} (try ${attempt + 1}): ${(e as Error).message}`);
        await sleep(delays[attempt]);
      }
    }
  }

  private async teachContext(room: RoomRow, segment: number, slower: boolean) {
    const seg = room.lesson_plan!.segments[segment];
    const context = (await this.deps.retrieve.context(room, `${seg.title}. ${seg.objective}`)).text;
    return { roomId: room.id, prefix: await this.prefix(room), plan: room.lesson_plan!, segment, slower, lastCheck: this.lastCheck, summaries: this.summaries, context };
  }

  /** The prefetched segment, unless the host asked for Slower or under half the class got the check right. */
  private takePrefetch(segment: number, slower: boolean): ChunkBuffer<TeachChunk> | null {
    const p = this.next;
    this.next = null;
    if (!p) return null;
    const s = this.lastCheck?.spread;
    if (p.segment !== segment || slower || (s && s.total > 0 && s.correct / s.total < 0.5)) {
      p.chunks.cancel(); // re-taught differently: stop spending tokens on it
      return null;
    }
    return p.chunks;
  }

  private async evaluateGate() {
    const room = await this.deps.rooms.get(this.roomId);
    if (room.phase !== 'check' || room.gate_held) return;
    const [members, votes, threads] = await Promise.all([
      this.deps.rooms.activeMembers(room.id),
      this.db.from('ready_votes').select('user_id').eq('room_id', room.id).eq('segment', room.segment),
      this.db.from('threads').select('owner_id, members').eq('room_id', room.id).eq('status', 'open'),
    ]);
    const ready = new Set((votes.data ?? []).map((v) => v.user_id as string));
    // thread owners and classmates who joined their threads are excused from the gate
    const excused = new Set((threads.data ?? []).flatMap((t) => [t.owner_id as string, ...((t.members as string[] | null) ?? [])]));
    // activeMembers is presence-aware: PresenceService sets left_at after 15 s of absence
    const waitingFor = members.filter((m) => !excused.has(m.user_id) && !ready.has(m.user_id));
    // an empty room never passes on its own (no runaway lesson)
    if (members.length && !waitingFor.length) return this.passGate(room);
    if (ready.size && !room.gate_deadline) {
      const deadline = new Date(Date.now() + LIVE.gateTimeoutMs);
      await this.deps.rooms.update(room.id, { gate_deadline: deadline.toISOString() });
      this.armTimer(room.segment, deadline);
    }
  }

  private armTimer(segment: number, deadline: Date) {
    if (this.gateTimer) clearTimeout(this.gateTimer);
    this.gateTimer = setTimeout(() => {
      void this.enqueue('gate-timeout', async () => {
        const room = await this.deps.rooms.get(this.roomId);
        if (room.phase === 'check' && room.segment === segment && !room.gate_held) await this.passGate(room);
      });
    }, Math.max(0, deadline.getTime() - Date.now()));
  }

  private async passGate(room: RoomRow) {
    if (this.gateTimer) { clearTimeout(this.gateTimer); this.gateTimer = null; }
    this.failed = null; // Skip past a segment the tutor could not teach
    await this.closeChecks(room);
    // a Hold ends with the gate it held: the next gate starts free
    room = await this.deps.rooms.update(room.id, { phase: 'qa', gate_deadline: null, gate_held: false });
    // everything asked during the check is routed before the Q&A beat reads class clusters
    await this.deps.triage.runNow(room.id);
    await this.qaBeat(room);
    const next = room.segment + 1;
    if (next >= (room.lesson_plan?.segments.length ?? 0)) return this.end(room);
    await this.pendingSummary; // the lead tutor sees the summary of the segment just finished
    if (this.stopping) return; // End is queued: do not start another segment
    await this.teach(room, next);
  }

  /** Close the open check: spread for the class, then the answer. */
  private async closeChecks(room: RoomRow) {
    const open = await this.db.from('checks').select('*').eq('room_id', room.id).is('closed_at', null);
    for (const check of open.data ?? []) {
      const answers = await this.db.from('check_answers').select('answer, correct').eq('check_id', check.id);
      const rows = answers.data ?? [];
      const counts: Record<string, number> = {};
      for (const a of rows) {
        const key = typeof a.answer === 'object' ? JSON.stringify(a.answer) : String(a.answer);
        counts[key] = (counts[key] ?? 0) + 1;
      }
      const q = check.question as Question;
      const spread: CheckSpread = { total: rows.length, correct: rows.filter((a) => a.correct).length, counts };
      await this.db.from('checks').update({ closed_at: new Date().toISOString() }).eq('id', check.id);
      const answerText = correctAnswerText(q);
      await this.deps.events.append(room.main_stream_id, 'check_closed', { checkId: check.id, spread, answer: q.answer, answerText, explanation: q.explanation }, 'lead');
      this.lastCheck = { prompt: q.prompt, spread, answerText };
    }
  }

  /** Q&A beat: the lead tutor answers each class-routed cluster on the board and credits askers. */
  private async qaBeat(room: RoomRow) {
    const clusters = await this.db.from('clusters').select('*').eq('room_id', room.id).eq('route', 'class').eq('answered', false);
    if (!clusters.data?.length) return;
    const prefix = await this.prefix(room);
    const known = await this.deps.retrieve.known(room);
    // every cluster's questions in one query
    const all = await this.db.from('questions').select('cluster_id, text, author_name').eq('room_id', room.id).in('cluster_id', clusters.data.map((c) => c.id));
    for (const c of clusters.data) {
      const qs = (all.data ?? []).filter((q) => q.cluster_id === c.id);
      const askers = [...new Set(qs.map((q) => q.author_name as string))];
      const texts = qs.map((q) => q.text as string);
      try {
        const found = await this.deps.retrieve.context(room, [c.title, ...texts].join(' '));
        const top = found.passages[0];
        const raw = await this.deps.lead.answerCluster(prefix, c.title, texts, askers, room.id, { text: found.text, cite: top ? citation(top.sourceId, top.page) : undefined });
        const steps = keepKnownCitations(raw, known);
        await this.deps.events.append(room.main_stream_id, 'answer_cluster', { clusterId: c.id, title: c.title, askers, steps }, 'lead');
        const said = steps.flatMap((s) => ('say' in s ? [s.say] : [])).join(' ');
        await this.db.from('clusters').update({ answered: true, answer: said || null }).eq('id', c.id);
      } catch (e) {
        this.log.error(`answer cluster ${c.id}: ${(e as Error).message}`);
        await this.notice(room, `The tutor could not answer "${c.title.slice(0, 80)}" right now.`, 'warn');
      }
    }
  }

  private async end(room: RoomRow) {
    if (this.gateTimer) { clearTimeout(this.gateTimer); this.gateTimer = null; }
    if (room.phase === 'ended') return;
    await this.closeChecks(room);
    await this.deps.rooms.update(room.id, { phase: 'ended', ended_at: new Date().toISOString(), gate_deadline: null });
    await this.notice(room, 'Class ended. Thanks for learning together!');
    await this.pendingSummary;
    await this.writeNotes(room);
    await this.writeDeck(room);
    this.next?.chunks.cancel();
    this.next = null;
    this.deps.ended(room.id);
  }

  /** B12: a course's syllabus is searchable once per course. Never rejects. */
  private async indexSyllabus(room: RoomRow) {
    try {
      const syllabus = await this.deps.rooms.syllabusOf(room);
      if (!room.course_id || !syllabus) return;
      const has = await this.db.from('sources').select('id', { count: 'exact', head: true }).eq('course_id', room.course_id).eq('kind', 'syllabus');
      if (!has.count) await this.deps.ingest.indexNow({ course_id: room.course_id }, 'syllabus', 'Course syllabus', [{ page: null, text: syllabus, heading: 'Syllabus' }]);
    } catch (e) {
      this.log.warn(`syllabus: ${(e as Error).message}`);
    }
  }

  /** Never rejects: a missing summary must not break the class. */
  private async summarize(room: RoomRow, segment: number, title: string) {
    try {
      const events = await this.deps.events.after(room.main_stream_id);
      const asked = await this.db.from('questions').select('text').eq('room_id', room.id).eq('segment', segment);
      const questions = (asked.data ?? []).map((q) => `- ${q.text as string}`).join('\n');
      const transcript = [segmentTranscript(events, segment), questions && `Learners asked:\n${questions}`].filter(Boolean).join('\n\n');
      const summary = await this.deps.scribe.summarize(await this.deps.rooms.prefixOf(room, { board: false }), title, transcript, room.id);
      await this.deps.events.append(room.main_stream_id, 'segment_summary', { segment, title, summary }, 'scribe');
      this.summaries.push(summary);
      // B12: the class transcript becomes searchable for threads and the Q&A beat
      const narration = segmentTranscript(events, segment);
      // in the background: the next segment waits for the summary, not for indexing (never rejects)
      if (narration) void this.deps.ingest.indexNow({ room_id: room.id }, 'transcript', `Segment ${segment}: ${title}`, [{ page: null, text: `${narration}\n\nSummary: ${summary}`, heading: title }]);
    } catch (e) {
      this.log.warn(`summary ${segment}: ${(e as Error).message}`);
    }
  }

  /** Shared notes from what the class produced (no extra model call); FAQ rows for course rooms. */
  private async writeNotes(room: RoomRow) {
    if (!room.lesson_plan) return; // ended from the lobby: nothing was taught
    const existing = await this.db.from('note_blocks').select('id', { count: 'exact', head: true }).eq('room_id', room.id);
    if (existing.count) return;
    const events = await this.deps.events.after(room.main_stream_id);
    const rows = await this.db.from('clusters').select('title, answer, asker_count, reason').eq('room_id', room.id).or('answered.eq.true,route.eq.inline');
    const clusters = (rows.data ?? []).map((c) => ({ title: c.title as string, answer: c.answer as string | null, askers: c.asker_count as number, reason: c.reason as string | null }));
    const blocks = buildNotes({ plan: room.lesson_plan, summaries: summariesOf(events), checks: checkResults(events), clusters });
    // note_blocks_room_idx: a second writer (another instance) keeps the first one's notes
    const ins = await this.db.from('note_blocks').upsert(blocks.map((markdown, idx) => ({ room_id: room.id, idx, markdown })), { onConflict: 'room_id,idx', ignoreDuplicates: true });
    if (ins.error) this.log.error(`notes: ${ins.error.message}`);
    // B12: the next classes of the course can search these notes and answers
    if (room.course_id) {
      await this.deps.ingest.indexNow({ course_id: room.course_id }, 'notes', `Notes: ${room.title}`, blocks.map((b) => ({ page: null, text: b, heading: '' })));
      const answered = clusters.filter((c) => c.answer);
      if (answered.length) await this.deps.ingest.indexNow({ course_id: room.course_id }, 'faq', `FAQ: ${room.title}`, answered.map((c) => ({ page: null, text: `Q: ${c.title}\nA: ${c.answer}`, heading: c.title })));
    }
    // new answers only: skip ones reused from the FAQ and the triage fallback, or rows pile up
    const faq = clusters.filter((c) => c.answer && c.answer !== FALLBACK_ANSWER && c.reason !== FAQ_REASON);
    if (room.course_id && faq.length) {
      // faq_course_question: one row per question (any case); one that exists is skipped
      for (const c of faq) {
        const f = await this.db.from('faq').insert({ course_id: room.course_id, topic_id: room.topic_id, question: c.title, answer: c.answer, askers_total: c.askers });
        if (f.error && f.error.code !== '23505') this.log.warn(`faq: ${f.error.message}`);
      }
    }
  }

  /** The class deck from the notes (one scribe call). Never rejects: the class has already ended. */
  private async writeDeck(room: RoomRow) {
    if (!room.lesson_plan) return;
    try {
      const existing = await this.db.from('cards').select('id', { count: 'exact', head: true }).eq('room_id', room.id);
      if (existing.error) throw new Error(existing.error.message);
      if (existing.count) return;
      const notes = await this.db.from('note_blocks').select('markdown').eq('room_id', room.id).order('idx');
      const asked = await this.db.from('clusters').select('title').eq('room_id', room.id).eq('route', 'class');
      const checks = checkResults(await this.deps.events.after(room.main_stream_id)).map((c) => `- ${c.prompt} Answer: ${c.answerText} (${c.correct}/${c.total} correct)`);
      const questions = (asked.data ?? []).map((c) => `- Asked: ${c.title as string}`);
      const cards = await this.deps.scribe.proposeCards(await this.prefix(room), room.lesson_plan,
        (notes.data ?? []).map((b) => b.markdown as string).join('\n\n'), [...checks, ...questions].join('\n'), room.id);
      // cards_room_front: one card per front (the scribe may repeat one; a second writer is skipped)
      const fronts = new Map(cards.map((c) => [c.front, c]));
      const ins = await this.db.from('cards').upsert([...fronts.values()].map((c) => ({ room_id: room.id, course_id: room.course_id, front: c.front, back: c.back, status: 'active' })), { onConflict: 'room_id,front', ignoreDuplicates: true });
      if (ins.error) throw new Error(ins.error.message);
    } catch (e) {
      this.log.error(`deck: ${(e as Error).message}`);
    }
  }

  private async doHost(action: HostAction) {
    const room = await this.deps.rooms.get(this.roomId);
    switch (action) {
      case 'skip':
        if (room.phase === 'check') await this.passGate(room);
        return;
      case 'hold':
        if (this.gateTimer) { clearTimeout(this.gateTimer); this.gateTimer = null; }
        await this.deps.rooms.update(room.id, { gate_held: true, gate_deadline: null });
        return;
      case 'resume': {
        const updated = await this.deps.rooms.update(room.id, { gate_held: false });
        // the tutor could not teach a segment: Resume tries it again
        if (this.failed !== null && room.phase === 'check') {
          const segment = this.failed;
          this.failed = null;
          // votes cast at the held gate were for the failed try, not for the segment taught now
          const cleared = await this.db.from('ready_votes').delete().eq('room_id', room.id).eq('segment', segment);
          if (cleared.error) this.log.warn(`ready votes: ${cleared.error.message}`);
          return this.teach(updated, segment);
        }
        return this.evaluateGate();
      }
      case 'slower':
        this.slower = true;
        return;
      case 'end':
        return this.end(room);
    }
  }

  /** After an API restart: finish whatever phase the room was in. */
  private async doRecover() {
    const room = await this.deps.rooms.get(this.roomId);
    this.summaries = summariesOf(await this.deps.events.after(room.main_stream_id)).map((s) => s.summary);
    if (room.phase === 'teaching' || room.phase === 'qa') {
      // the segment may be half-written; let the class move on from its gate
      await this.notice(room, 'The tutor reconnected.', 'info');
      await this.deps.rooms.update(room.id, { phase: 'check' });
    }
    if (room.gate_deadline) this.armTimer(room.segment, new Date(room.gate_deadline));
    await this.evaluateGate();
  }
}

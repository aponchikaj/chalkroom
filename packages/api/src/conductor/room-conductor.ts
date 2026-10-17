// RoomConductor: a per-room actor. Every phase change runs on one serial queue, so two
// requests can never move the same room at once. The phase lives in rooms.phase, so a
// restarted API resumes from the database (see recover()).
//
//   lobby ─start→ teaching ─segment ends→ check ─gate passes→ qa ─→ teaching (next) … → ended
//
// Gate passes when every present learner who is not in a thread is ready, OR 60 s after the
// first ready vote, OR the host skips. Hold pauses the gate.
import { Logger } from '@nestjs/common';
import { LIVE, PublicQuestion, correctAnswerText, type CheckSpread, type Question, type RoomRow } from '@chalk/schema';
import type { SupabaseService } from '../core/supabase.service';
import type { EventsService } from '../core/events.service';
import type { RoomsService } from '../rooms/rooms.service';
import type { LeadTutorAgent } from '../agents/lead-tutor.agent';
import type { TriageService } from '../triage/triage.service';
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

export interface ConductorDeps {
  supa: SupabaseService;
  events: EventsService;
  rooms: RoomsService;
  lead: LeadTutorAgent;
  triage: TriageService;
  scribe: ScribeAgent;
  retrieve: RetrieveService;
  ingest: IngestWorker;
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
  /** the next segment, written while the class is at the gate (pipelining) */
  private next: { segment: number; chunks: ChunkBuffer<TeachChunk> } | null = null;

  constructor(readonly roomId: string, private deps: ConductorDeps) {
    this.log = new Logger(`Room ${roomId.slice(0, 8)}`);
  }

  // -------------------------------------------------------------------------
  // Public API (each call is queued; callers do not wait for teaching to finish)
  // -------------------------------------------------------------------------

  start() { return this.enqueue('start', () => this.doStart()); }
  readyChanged() { return this.enqueue('gate', () => this.evaluateGate()); }
  membersChanged() { return this.enqueue('gate', () => this.evaluateGate()); }
  host(action: HostAction) { return this.enqueue(`host:${action}`, () => this.doHost(action)); }
  recover() { return this.enqueue('recover', () => this.doRecover()); }

  // -------------------------------------------------------------------------

  private enqueue<T>(what: string, fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn);
    this.queue = p.catch((e) => this.log.error(`${what} failed: ${(e as Error).stack ?? e}`));
    return p;
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
    const plan = await this.deps.lead.plan(await this.prefix(room), room.title, room.id);
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
        drawn++;
        if ('steps' in chunk) await this.deps.events.append(main, 'board', { steps: keepKnownCitations(chunk.steps, known) }, 'lead');
        else if ('check' in chunk) {
          const row = await this.db.from('checks').insert({ room_id: room.id, segment, question: chunk.check }).select('id').single();
          if (row.error) throw new Error(row.error.message);
          await this.deps.events.append(main, 'check', { checkId: row.data.id, segment, question: PublicQuestion.parse(chunk.check) }, 'lead');
        }
      }
    };
    try {
      await run(this.takePrefetch(segment, slower) ?? this.deps.lead.teach(await this.teachContext(room, segment, slower)));
    } catch (e) {
      this.log.error(`teach ${segment}: ${(e as Error).message}`);
      // B6: Board Script still invalid after the repair pass and nothing drawn yet: one simple retry
      let recovered = false;
      if (!drawn && /invalid teach_segment/.test((e as Error).message)) {
        try {
          await run(this.deps.lead.teach({ ...(await this.teachContext(room, segment, slower)), simple: true }));
          recovered = true;
        } catch (e2) {
          this.log.error(`teach ${segment} (simple): ${(e2 as Error).message}`);
        }
      }
      if (!recovered) await this.notice(room, 'The tutor had trouble with this segment. Ask a question, or the host can skip ahead.', 'warn');
    }
    await this.deps.events.append(main, 'segment_end', { segment }, 'lead');
    // the summary runs beside the gate, never in front of it
    this.pendingSummary = this.summarize(room, segment, plan.segments[segment].title);
    // pipelining: write the next segment while the class answers the check and votes
    if (config.pipeline && segment + 1 < plan.segments.length) {
      this.next = { segment: segment + 1, chunks: prefetch(this.deps.lead.teach(await this.teachContext(room, segment + 1, false))) };
    }
    await this.deps.rooms.update(room.id, { phase: 'check' });
    await this.evaluateGate();
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
    if (!p || p.segment !== segment || slower) return null;
    const s = this.lastCheck?.spread;
    if (s && s.total > 0 && s.correct / s.total < 0.5) return null;
    return p.chunks;
  }

  private async evaluateGate() {
    const room = await this.deps.rooms.get(this.roomId);
    if (room.phase !== 'check' || room.gate_held) return;
    const [members, votes, threads] = await Promise.all([
      this.deps.rooms.activeMembers(room.id),
      this.db.from('ready_votes').select('user_id').eq('room_id', room.id).eq('segment', room.segment),
      this.db.from('threads').select('owner_id').eq('room_id', room.id).eq('status', 'open'),
    ]);
    const ready = new Set((votes.data ?? []).map((v) => v.user_id as string));
    const excused = new Set((threads.data ?? []).map((t) => t.owner_id as string));
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
    await this.closeChecks(room);
    room = await this.deps.rooms.update(room.id, { phase: 'qa', gate_deadline: null });
    // everything asked during the check is routed before the Q&A beat reads class clusters
    await this.deps.triage.runNow(room.id);
    await this.qaBeat(room);
    const next = room.segment + 1;
    if (next >= (room.lesson_plan?.segments.length ?? 0)) return this.end(room);
    await this.pendingSummary; // the lead tutor sees the summary of the segment just finished
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
    for (const c of clusters.data) {
      const qs = await this.db.from('questions').select('text, author_name').eq('cluster_id', c.id);
      const askers = [...new Set((qs.data ?? []).map((q) => q.author_name as string))];
      const texts = (qs.data ?? []).map((q) => q.text as string);
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
      if (narration) await this.deps.ingest.indexNow({ room_id: room.id }, 'transcript', `Segment ${segment}: ${title}`, [{ page: null, text: `${narration}\n\nSummary: ${summary}`, heading: title }]);
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
    const rows = await this.db.from('clusters').select('title, answer, asker_count').eq('room_id', room.id).or('answered.eq.true,route.eq.inline');
    const clusters = (rows.data ?? []).map((c) => ({ title: c.title as string, answer: c.answer as string | null, askers: c.asker_count as number }));
    const blocks = buildNotes({ plan: room.lesson_plan, summaries: summariesOf(events), checks: checkResults(events), clusters });
    const ins = await this.db.from('note_blocks').insert(blocks.map((markdown, idx) => ({ room_id: room.id, idx, markdown })));
    if (ins.error) this.log.error(`notes: ${ins.error.message}`);
    // B12: the next classes of the course can search these notes and answers
    if (room.course_id) {
      await this.deps.ingest.indexNow({ course_id: room.course_id }, 'notes', `Notes: ${room.title}`, blocks.map((b) => ({ page: null, text: b, heading: '' })));
      const answered = clusters.filter((c) => c.answer);
      if (answered.length) await this.deps.ingest.indexNow({ course_id: room.course_id }, 'faq', `FAQ: ${room.title}`, answered.map((c) => ({ page: null, text: `Q: ${c.title}\nA: ${c.answer}`, heading: c.title })));
    }
    const faq = clusters.filter((c) => c.answer);
    if (room.course_id && faq.length) {
      const f = await this.db.from('faq').insert(faq.map((c) => ({ course_id: room.course_id, topic_id: room.topic_id, question: c.title, answer: c.answer, askers_total: c.askers })));
      if (f.error) this.log.warn(`faq: ${f.error.message}`);
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
      case 'resume':
        await this.deps.rooms.update(room.id, { gate_held: false });
        return this.evaluateGate();
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

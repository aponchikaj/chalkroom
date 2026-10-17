# Dev B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every Dev B task (B1 to B8) so the Chalkroom Live demo runs end to end: triage,
threads, scribe and notes, presence-aware gates, the real model, reliability and deployment.

**Architecture:** NestJS API in `packages/api`. Decision logic lives in pure, unit-tested
modules (no DB, no `config` import); thin services read rows, call the pure function, write
rows and append events through `EventsService.append`. Each room keeps one serial
`RoomConductor` queue for phase changes; triage, thread replies and presence get their own
lanes so they never wait behind a segment being taught.

**Tech Stack:** Node 20+, TypeScript, NestJS 12, Zod 4, supabase-js 2, Supabase (Postgres 17,
Realtime, anonymous auth), `@anthropic-ai/sdk`, Vitest 4.

**Spec:** `docs/design.md` (product), `docs/TASKS.md` (lanes), `docs/DEVB_TASKS.md` (the task
detail this plan implements). Read DEVB_TASKS.md first; this file is the how.

## Global Constraints

- Contract: `packages/schema/src/live.ts`. Never send a shape not defined there. Contract
  changes go first, in their own small PR (only B6 and B8 need one).
- Only the API writes to the database. Stream events only through `EventsService.append`.
- New SQL only in a new migration (`npx supabase migration new <name>`); never edit a
  migration already on `main`.
- Every agent keeps a working `mock` answer; `MODEL=mock` must always run a full class.
- Default model for all agents: `claude-haiku-4-5`.
- Plain text everywhere: no emoji in code, comments, UI copy, commits or docs (CLAUDE.md rule 3).
- Tests live in `packages/<pkg>/test/*.test.ts` (Vitest include pattern
  `packages/*/test/**/*.test.ts`). A test must never import `packages/api/src/config.ts`
  (it throws without env vars), so tested modules import only `@chalk/*`, `zod` and types.
- Commits: on branch `Lazare`; `git -c commit.gpgsign=false commit ...` when signing asks for a
  passphrase. Ask for the branch before every push.
- Gate before every commit: `npm run typecheck && npm test`; with `npm run dev` running,
  `npm run smoke`.

## File structure

New files (all under `packages/api/src` unless noted):

| File | Responsibility | Task |
|---|---|---|
| `triage/triage-plan.ts` | Pure: agent result to cluster/question writes and thread offers | B2 |
| `triage/triage.service.ts` | Per-room triage lane: batch window, run, apply | B2 |
| `threads/thread-store.ts` | Thread rows and streams (offer, create, update, main seq) | B2, B4 |
| `threads/thread-context.ts` | Pure: chat history and main board for the thread tutor | B4 |
| `threads/threads.service.ts` | open, message, close, share | B4 |
| `conductor/narration.ts` | Pure: segment transcript, check results, summaries from events | B3 |
| `notes/notes.ts` | Pure: note blocks from plan, summaries, checks, clusters | B3 |
| `notes/notes.controller.ts` | `PUT /rooms/:id/notes/:blockId` | B3 |
| `presence/presence-tracker.ts` | Pure: who left, who came back; host successor | B5 |
| `presence/presence.service.ts` | Realtime presence watcher per room | B5 |
| `agents/step-streamer.ts` | Pure: complete `steps[]` elements out of partial JSON | B1 |
| `agents/teach-stream.ts` | Validated streaming of `teach_segment` | B1 |
| `agents/metered.model.ts` | `UsageMeter` + `MeteredModel` (usage log, B6 budget) | B1, B6 |
| `conductor/prefetch.ts` | `ChunkBuffer` and `prefetch()` for pipelining | B1 |
| `supabase/migrations/<ts>_member_moderation.sql` | `muted`, `banned`, `is_member` | B6 |
| `vercel.json` (repo root) | Web build and SPA rewrite | B7 |

Tests: `packages/api/test/{triage-plan,thread-context,narration,notes,presence,step-streamer,teach-stream,prefetch}.test.ts`.

Modified: `rooms/rooms.service.ts`, `rooms/rooms.controller.ts`,
`questions/questions.controller.ts`, `threads/threads.controller.ts`,
`conductor/room-conductor.ts`, `conductor/conductor.service.ts`, `agents/*.agent.ts`,
`agents/model.port.ts`, `agents/anthropic.model.ts`, `agents/agents.module.ts`,
`app.module.ts`, `config.ts`, `scripts/smoke.mjs`, `packages/schema/src/live.ts` (B6 only).

---

## Task 1 (B2): Shared room prefix and the pure triage planner

**Files:**
- Modify: `packages/api/src/rooms/rooms.service.ts`
- Modify: `packages/api/src/conductor/room-conductor.ts:66-68`
- Create: `packages/api/src/triage/triage-plan.ts`
- Test: `packages/api/test/triage-plan.test.ts`

**Interfaces:**
- Produces: `RoomsService.prefixOf(room: RoomRow): Promise<string>`;
  `planTriage(result: TriageResult, questions: TriageQuestion[], clusters: TriageCluster[]): TriagePlan`;
  `FALLBACK_ANSWER`, `EMPTY_TRIAGE`, types `TriageQuestion`, `TriageCluster`, `ClusterWrite`,
  `QuestionWrite`, `ThreadOffer`, `TriagePlan`.

- [ ] **Step 1: Move the room prefix into RoomsService** (triage, threads and the conductor all need the same bytes)

In `rooms/rooms.service.ts` add the import and method:

```ts
import { roomPrefix } from '../agents/prompts';

  /** The cached prefix every agent of this room shares. Byte-stable across calls. */
  async prefixOf(room: RoomRow): Promise<string> {
    return roomPrefix({ title: room.title, goal: room.goal, syllabus: await this.syllabusOf(room) }, room.lesson_plan);
  }
```

In `conductor/room-conductor.ts` replace the body of `prefix()`:

```ts
  private prefix(room: RoomRow) { return this.deps.rooms.prefixOf(room); }
```

and delete the now unused `import { roomPrefix } from '../agents/prompts';`.

- [ ] **Step 2: Write the failing tests**

```ts
// packages/api/test/triage-plan.test.ts
import { describe, it, expect } from 'vitest';
import { mockTriage } from '@chalk/mock-tutor';
import { EMPTY_TRIAGE, FALLBACK_ANSWER, planTriage } from '../src/triage/triage-plan';

const q = (id: string, text: string, authorId: string) => ({ id, text, authorId });

describe('planTriage', () => {
  it('groups two learners asking the same thing into one class cluster', () => {
    const questions = [q('q1', 'Why can a PDA not sign?', 'u1'), q('q2', "Why can't a PDA sign transactions?", 'u2')];
    const plan = planTriage(mockTriage({ questions, clusters: [], history: {} }), questions, []);
    expect(plan.clusters).toHaveLength(1);
    expect(plan.clusters[0]).toMatchObject({ isNew: true, route: 'class', askerIds: ['u1', 'u2'] });
    expect(plan.questions.map((x) => x.status)).toEqual(['grouped', 'grouped']);
    expect(new Set(plan.questions.map((x) => x.clusterKey)).size).toBe(1);
  });

  it('answers a lone question inline', () => {
    const questions = [q('q1', 'What is a seed?', 'u1')];
    const plan = planTriage(mockTriage({ questions, clusters: [], history: {} }), questions, []);
    expect(plan.clusters[0].route).toBe('inline');
    expect(plan.clusters[0].answer).toBeTruthy();
    expect(plan.questions[0].status).toBe('answered');
  });

  it('never leaves a question pending when the agent failed', () => {
    const questions = [q('q1', 'a', 'u1'), q('q2', 'b', 'u2')];
    const plan = planTriage(EMPTY_TRIAGE, questions, []);
    expect(plan.questions.every((x) => x.status === 'answered')).toBe(true);
    expect(plan.clusters.every((c) => c.route === 'inline' && c.answer === FALLBACK_ANSWER)).toBe(true);
  });

  it('flags without clustering', () => {
    const questions = [q('q1', 'spam spam', 'u1')];
    const plan = planTriage({ assign: [{ questionId: 'q1', cluster: 'new', title: 'spam' }], route: [], flag: [{ questionId: 'q1', reason: 'spam' }] }, questions, []);
    expect(plan.questions).toEqual([{ questionId: 'q1', clusterKey: null, status: 'flagged' }]);
    expect(plan.clusters).toHaveLength(0);
  });

  it('routes into an existing cluster for later', () => {
    const questions = [q('q1', 'How does invoke_signed work?', 'u2')];
    const clusters = [{ id: 'c1', title: 'invoke_signed', route: null, askerIds: ['u1'] }];
    const plan = planTriage({ assign: [{ questionId: 'q1', cluster: 'c1' }], route: [{ cluster: 'c1', to: 'later', segment: 2 }], flag: [] }, questions, clusters);
    expect(plan.clusters[0]).toMatchObject({ key: 'c1', isNew: false, route: 'later', targetSegment: 2, askerIds: ['u1', 'u2'] });
    expect(plan.questions[0]).toEqual({ questionId: 'q1', clusterKey: 'c1', status: 'later' });
  });

  it('matches new clusters by title regardless of case and offers a thread', () => {
    const questions = [q('q1', 'Bump seeds in depth?', 'u3')];
    const result = { assign: [{ questionId: 'q1', cluster: 'new', title: 'Bump seeds' }], route: [{ cluster: 'bump SEEDS ', to: 'thread' as const, user: 'u3' }], flag: [] };
    const plan = planTriage(result, questions, []);
    expect(plan.questions[0].status).toBe('thread');
    expect(plan.offers).toEqual([{ ownerId: 'u3', topic: 'Bump seeds', questionId: 'q1' }]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run packages/api/test/triage-plan.test.ts`
Expected: FAIL, cannot resolve `../src/triage/triage-plan`.

- [ ] **Step 4: Implement the planner**

```ts
// packages/api/src/triage/triage-plan.ts
// Pure: turns one triage tool call into the rows to write. No DB, no config, so it is unit-tested.
// Rule: every question leaves `pending` (UX rule 2), whatever the agent returned.
import type { ClusterRoute, QuestionStatus, TriageResult } from '@chalk/schema';

export interface TriageQuestion { id: string; text: string; authorId: string }
export interface TriageCluster { id: string; title: string; route: ClusterRoute | null; askerIds: string[] }

export interface ClusterWrite {
  /** existing cluster id, or `new:<normalized title>` for a cluster to insert */
  key: string;
  isNew: boolean;
  title: string;
  route: ClusterRoute;
  reason: string | null;
  targetSegment: number | null;
  answer: string | null;
  askerIds: string[];
}
export interface QuestionWrite { questionId: string; clusterKey: string | null; status: QuestionStatus }
export interface ThreadOffer { ownerId: string; topic: string; questionId: string }
export interface TriagePlan { clusters: ClusterWrite[]; questions: QuestionWrite[]; offers: ThreadOffer[] }

export const FALLBACK_ANSWER = 'The tutor will answer this in the next Q&A.';
export const EMPTY_TRIAGE: TriageResult = { assign: [], route: [], flag: [] };

const STATUS: Record<ClusterRoute, QuestionStatus> = { class: 'grouped', later: 'later', inline: 'answered', thread: 'thread' };
const newKey = (title: string) => `new:${title.trim().toLowerCase()}`;

type Draft = ClusterWrite & { routed: boolean; questionIds: string[] };

export function planTriage(result: TriageResult, questions: TriageQuestion[], clusters: TriageCluster[]): TriagePlan {
  const existing = new Map(clusters.map((c) => [c.id, c]));
  const drafts = new Map<string, Draft>();
  const flagged = new Set(result.flag.map((f) => f.questionId));
  const byId = new Map(questions.map((x) => [x.id, x]));
  const assigned = new Map<string, string>(); // question id -> cluster key

  const fromExisting = (c: TriageCluster): Draft => ({
    key: c.id, isNew: false, title: c.title, route: c.route ?? 'inline', reason: null, targetSegment: null,
    answer: null, askerIds: [...c.askerIds], routed: c.route !== null, questionIds: [],
  });
  const fresh = (title: string): Draft => ({
    key: newKey(title), isNew: true, title: title.trim(), route: 'inline', reason: null, targetSegment: null,
    answer: null, askerIds: [], routed: false, questionIds: [],
  });
  const draftFor = (key: string, make: () => Draft) => {
    let d = drafts.get(key);
    if (!d) { d = make(); drafts.set(key, d); }
    return d;
  };
  const join = (d: Draft, question: TriageQuestion) => {
    if (!d.askerIds.includes(question.authorId)) d.askerIds.push(question.authorId);
    d.questionIds.push(question.id);
    assigned.set(question.id, d.key);
  };

  for (const a of result.assign) {
    const question = byId.get(a.questionId);
    if (!question || flagged.has(question.id) || assigned.has(question.id)) continue;
    const hit = a.cluster !== 'new' ? existing.get(a.cluster) : undefined;
    const d = hit ? draftFor(hit.id, () => fromExisting(hit)) : draftFor(newKey(a.title ?? question.text), () => fresh(a.title ?? question.text));
    join(d, question);
  }
  // the model forgot a question: it becomes its own cluster
  for (const question of questions) {
    if (flagged.has(question.id) || assigned.has(question.id)) continue;
    join(draftFor(newKey(question.text), () => fresh(question.text)), question);
  }

  const offers: ThreadOffer[] = [];
  for (const r of result.route) {
    const hit = existing.get(r.cluster);
    const d = drafts.get(r.cluster) ?? drafts.get(newKey(r.cluster)) ?? (hit ? draftFor(hit.id, () => fromExisting(hit)) : undefined);
    if (!d) continue;
    d.route = r.to;
    d.routed = true;
    d.reason = r.reason ?? null;
    d.targetSegment = r.to === 'later' ? r.segment ?? null : null;
    d.answer = r.to === 'inline' ? r.answer ?? null : d.answer;
    if (r.to === 'thread' && d.questionIds.length) {
      const owner = r.user && d.askerIds.includes(r.user) ? r.user : d.askerIds[0];
      if (owner && !offers.some((o) => o.ownerId === owner)) offers.push({ ownerId: owner, topic: d.title, questionId: d.questionIds[0] });
    }
  }

  for (const d of drafts.values()) {
    if (!d.routed) { d.route = 'inline'; d.reason = d.reason ?? 'no route from triage'; }
    if (d.route === 'inline' && !d.answer) d.answer = FALLBACK_ANSWER;
  }

  const questionWrites: QuestionWrite[] = questions.map((question) => {
    if (flagged.has(question.id)) return { questionId: question.id, clusterKey: null, status: 'flagged' };
    const key = assigned.get(question.id)!;
    return { questionId: question.id, clusterKey: key, status: STATUS[drafts.get(key)!.route] };
  });

  return {
    clusters: [...drafts.values()].map(({ routed: _r, questionIds: _q, ...c }) => c),
    questions: questionWrites,
    offers,
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run packages/api/test/triage-plan.test.ts`
Expected: PASS (6 tests). Then `npm run typecheck`: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/rooms/rooms.service.ts packages/api/src/conductor/room-conductor.ts packages/api/src/triage/triage-plan.ts packages/api/test/triage-plan.test.ts
git commit -m "feat(api): Add pure triage planner and shared room prefix"
```

---

## Task 2 (B2): TriageService, offered threads and gate wiring

**Files:**
- Create: `packages/api/src/threads/thread-store.ts`
- Create: `packages/api/src/triage/triage.service.ts`
- Modify: `packages/api/src/questions/questions.controller.ts:10,24,34`
- Modify: `packages/api/src/conductor/room-conductor.ts` (deps, `questionAsked`, `passGate`)
- Modify: `packages/api/src/conductor/conductor.service.ts`
- Modify: `packages/api/src/app.module.ts`
- Modify: `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `planTriage`, `EMPTY_TRIAGE`, `TriagePlan` (Task 1); `RoomsService.prefixOf`.
- Produces: `ThreadStore.offer(room, ownerId, topic): Promise<ThreadRow | null>`,
  `ThreadStore.get`, `ThreadStore.update`, `ThreadStore.createOpen`, `ThreadStore.mainSeq`,
  `ThreadStore.hasActive`; `TriageService.schedule(roomId): void`,
  `TriageService.runNow(roomId): Promise<void>`.

- [ ] **Step 1: ThreadStore** (B4 extends its use; the offer is all B2 needs)

```ts
// packages/api/src/threads/thread-store.ts
// Thread rows and their streams. No conductor dependency, so triage can offer threads.
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { RoomRow, ThreadRow } from '@chalk/schema';
import { SupabaseService, must } from '../core/supabase.service';
import { EventsService } from '../core/events.service';

@Injectable()
export class ThreadStore {
  constructor(private supa: SupabaseService, private events: EventsService) {}

  private get db() { return this.supa.db; }

  async get(threadId: string): Promise<ThreadRow> {
    const r = await this.db.from('threads').select('*').eq('id', threadId).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) throw new NotFoundException('thread not found');
    return r.data as ThreadRow;
  }

  async update(threadId: string, patch: Partial<ThreadRow>): Promise<ThreadRow> {
    return must(await this.db.from('threads').update(patch).eq('id', threadId).select('*').single(), 'update thread') as ThreadRow;
  }

  async hasActive(roomId: string, ownerId: string, statuses: ThreadRow['status'][] = ['offered', 'open']): Promise<boolean> {
    const r = await this.db.from('threads').select('id').eq('room_id', roomId).eq('owner_id', ownerId).in('status', statuses).limit(1);
    return !!r.data?.length;
  }

  /** Triage route `thread`: an opt-in offer. One offer or open thread per learner at a time. */
  async offer(room: RoomRow, ownerId: string, topic: string): Promise<ThreadRow | null> {
    if (await this.hasActive(room.id, ownerId)) return null;
    const streamId = await this.events.createStream(room.id, 'thread');
    return must(await this.db.from('threads').insert({
      room_id: room.id, owner_id: ownerId, stream_id: streamId, topic: topic.slice(0, 120), status: 'offered',
    }).select('*').single(), 'offer thread') as ThreadRow;
  }

  async createOpen(room: RoomRow, ownerId: string, topic: string, leftMainSeq: number): Promise<ThreadRow> {
    if (await this.hasActive(room.id, ownerId, ['open'])) throw new ConflictException('you already have an open thread');
    const streamId = await this.events.createStream(room.id, 'thread');
    const r = await this.db.from('threads').insert({
      room_id: room.id, owner_id: ownerId, stream_id: streamId, topic: topic.slice(0, 120), status: 'open', left_main_seq: leftMainSeq,
    }).select('*').single();
    // threads_one_active: a parallel open won the race
    if (r.error?.code === '23505') throw new ConflictException('you already have an open thread');
    return must(r, 'open thread') as ThreadRow;
  }

  /** Main stream position, stored as left_main_seq for the catch-up card. */
  async mainSeq(room: RoomRow): Promise<number> {
    const r = must(await this.db.from('streams').select('last_seq').eq('id', room.main_stream_id).single(), 'main seq') as { last_seq: number };
    return Number(r.last_seq);
  }
}
```

- [ ] **Step 2: TriageService**

```ts
// packages/api/src/triage/triage.service.ts
// Triage runs on its own lane per room, never on the conductor queue: teach() holds that queue
// for a whole segment, and UX rule 2 needs every question out of `pending` within ~5 s.
// Batch window: run LIVE.triageDebounceMs after the first pending question of a batch.
import { Injectable, Logger } from '@nestjs/common';
import { LIVE, type ClusterRoute, type RoomRow } from '@chalk/schema';
import { SupabaseService, must } from '../core/supabase.service';
import { RoomsService } from '../rooms/rooms.service';
import { TriageAgent } from '../agents/triage.agent';
import { ThreadStore } from '../threads/thread-store';
import { EMPTY_TRIAGE, planTriage, type TriageCluster, type TriagePlan } from './triage-plan';

interface Lane { timer: ReturnType<typeof setTimeout> | null; running: Promise<void> }

@Injectable()
export class TriageService {
  private lanes = new Map<string, Lane>();
  private log = new Logger('Triage');

  constructor(private supa: SupabaseService, private rooms: RoomsService, private agent: TriageAgent, private threads: ThreadStore) {}

  private lane(roomId: string): Lane {
    let l = this.lanes.get(roomId);
    if (!l) { l = { timer: null, running: Promise.resolve() }; this.lanes.set(roomId, l); }
    return l;
  }

  /** A question arrived. Joins the open batch, or opens one. */
  schedule(roomId: string) {
    const lane = this.lane(roomId);
    if (lane.timer) return;
    lane.timer = setTimeout(() => { lane.timer = null; void this.runNow(roomId); }, LIVE.triageDebounceMs);
  }

  /** Run now, after any run in progress. The gate awaits this. Never rejects. */
  runNow(roomId: string): Promise<void> {
    const lane = this.lane(roomId);
    if (lane.timer) { clearTimeout(lane.timer); lane.timer = null; }
    lane.running = lane.running.then(() => this.run(roomId)).catch((e) => this.log.error(`room ${roomId.slice(0, 8)}: ${(e as Error).stack ?? e}`));
    return lane.running;
  }

  private get db() { return this.supa.db; }

  private async run(roomId: string) {
    const pending = must(await this.db.from('questions').select('id, text, author_id')
      .eq('room_id', roomId).eq('status', 'pending').order('created_at'), 'pending questions') as { id: string; text: string; author_id: string }[];
    if (!pending.length) return;
    const room = await this.rooms.get(roomId);

    const open = must(await this.db.from('clusters').select('id, title, route').eq('room_id', roomId).eq('answered', false), 'open clusters') as { id: string; title: string; route: ClusterRoute | null }[];
    const members = open.length
      ? must(await this.db.from('questions').select('cluster_id, author_id').in('cluster_id', open.map((c) => c.id)), 'cluster askers') as { cluster_id: string; author_id: string }[]
      : [];
    const clusters: TriageCluster[] = open.map((c) => ({ ...c, askerIds: [...new Set(members.filter((m) => m.cluster_id === c.id).map((m) => m.author_id))] }));

    const authors = [...new Set(pending.map((p) => p.author_id))];
    const past = must(await this.db.from('questions').select('author_id, text').eq('room_id', roomId).neq('status', 'pending')
      .in('author_id', authors).order('created_at', { ascending: false }).limit(50), 'asker history') as { author_id: string; text: string }[];
    const history = Object.fromEntries(authors.map((a) => [a, past.filter((p) => p.author_id === a).slice(0, 5).map((p) => p.text)]));

    const questions = pending.map((p) => ({ id: p.id, text: p.text, authorId: p.author_id }));
    let result = EMPTY_TRIAGE;
    try {
      result = await this.agent.run({
        prefix: await this.rooms.prefixOf(room), segment: room.segment,
        segmentTitle: room.lesson_plan?.segments[room.segment]?.title ?? room.title,
        questions, clusters, history,
      });
    } catch (e) {
      this.log.warn(`room ${roomId.slice(0, 8)}: triage failed, answering with the fallback (${(e as Error).message})`);
    }
    await this.apply(room, planTriage(result, questions, clusters));
  }

  /** Clusters first (so the web has them), then questions, then thread offers. */
  private async apply(room: RoomRow, plan: TriagePlan) {
    const ids = new Map<string, string>();
    for (const c of plan.clusters) {
      const row = { title: c.title, route: c.route, reason: c.reason, target_segment: c.targetSegment, answer: c.answer, asker_count: c.askerIds.length };
      if (c.isNew) {
        const ins = must(await this.db.from('clusters').insert({ room_id: room.id, ...row }).select('id').single(), 'insert cluster') as { id: string };
        ids.set(c.key, ins.id);
      } else {
        const up = await this.db.from('clusters').update(row).eq('id', c.key);
        if (up.error) throw new Error(up.error.message);
        ids.set(c.key, c.key);
      }
    }
    for (const q of plan.questions) {
      const up = await this.db.from('questions')
        .update({ cluster_id: q.clusterKey ? ids.get(q.clusterKey) ?? null : null, status: q.status })
        .eq('id', q.questionId).eq('status', 'pending');
      if (up.error) throw new Error(up.error.message);
    }
    for (const o of plan.offers) await this.threads.offer(room, o.ownerId, o.topic);
  }
}
```

- [ ] **Step 3: Wire the controller to triage**

In `questions/questions.controller.ts`: replace the `ConductorService` import and constructor
parameter with `TriageService`, and the call at line 34:

```ts
import { TriageService } from '../triage/triage.service';
// ...
  constructor(private supa: SupabaseService, private rooms: RoomsService, private triage: TriageService) {}
// ...
    this.triage.schedule(id);
    return q;
```

- [ ] **Step 4: Gate runs triage once more; remove the dead hook**

In `conductor/room-conductor.ts`:

```ts
import type { TriageService } from '../triage/triage.service';

export interface ConductorDeps {
  supa: SupabaseService;
  events: EventsService;
  rooms: RoomsService;
  lead: LeadTutorAgent;
  triage: TriageService;
}
```

Delete the `questionAsked()` method and its TODO comment (lines 49-54). In `passGate`, replace
the TODO line with:

```ts
    room = await this.deps.rooms.update(room.id, { phase: 'qa', gate_deadline: null });
    // everything asked during the check is routed before the Q&A beat reads class clusters
    await this.deps.triage.runNow(room.id);
    await this.qaBeat(room);
```

In `conductor/conductor.service.ts` inject and pass it, and re-run triage for resumed rooms:

```ts
import { TriageService } from '../triage/triage.service';
// constructor:
    private triage: TriageService,
// in for():
      c = new RoomConductor(roomId, { supa: this.supa, events: this.events, rooms: this.roomsService, lead: this.lead, triage: this.triage });
// in onApplicationBootstrap(), inside the loop:
    for (const { id } of r.data ?? []) { void this.for(id).recover(); this.triage.schedule(id); }
```

In `app.module.ts` add `ThreadStore` and `TriageService` to `providers` (with imports from
`./threads/thread-store` and `./triage/triage.service`).

- [ ] **Step 5: Extend the smoke test**

In `scripts/smoke.mjs` add a row waiter next to `waitFor`:

```js
const waitRow = (u, pred, what, ms = 15000) => Promise.race([
  new Promise((resolve) => { const t = setInterval(() => { const hit = u.rows.find(pred); if (hit) { clearInterval(t); resolve(hit); } }, 100); }),
  timeout(ms, `${u.name}: ${what}`),
]);
```

Replace the single `gio` question with two similar questions from both users:

```js
  await gio.call('POST', `/rooms/${room.id}/questions`, { text: 'Why can a PDA not sign?' });
  await ana.call('POST', `/rooms/${room.id}/questions`, { text: "Why can't a PDA sign transactions?" });
```

After the `gate passed` step add:

```js
  await waitRow(ana, (r) => r.table === 'clusters' && r.row.route === 'class' && r.row.asker_count === 2, 'a grouped class cluster');
  const qa = await waitFor(gio, (e) => e.kind === 'answer_cluster', 'the Q&A beat answer');
  if (!['Ana', 'Gio'].every((n) => qa.data.askers.includes(n))) fail(`Q&A credit missing an asker: ${qa.data.askers.join(', ')}`);
  step(`triage grouped 2 questions; Q&A credited ${qa.data.askers.join(' and ')}`);
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`. Restart `npm run dev`, then `npm run smoke`.
Expected: PASSED, including the new triage line. In the browser, ask a question: its row
leaves `pending` within about 4.5 s (watch Supabase Studio, table `questions`).

- [ ] **Step 7: Commit**

```bash
git add packages/api/src scripts/smoke.mjs
git commit -m "feat(api): Wire triage into questions and the ready gate" -m "Triage runs on its own per-room lane with a 4 s batch window, applies clusters, statuses and thread offers, and runs again at every gate before the Q&A beat."
```

## Checkpoint: M2 (Questions)
- [ ] Tests, typecheck and smoke green.
- [ ] Two browsers: two similar questions show as one card `grouped · 2 asked`, answered in the Q&A beat with both names.
- [ ] Tick B2 in `docs/TASKS.md`; PR `Lazare` to `main`; tell Dev A that A1 has real statuses.

---

## Task 3 (B4): Thread context helpers

**Files:**
- Create: `packages/api/src/threads/thread-context.ts`
- Test: `packages/api/test/thread-context.test.ts`

**Interfaces:**
- Produces: `chatHistory(events: StreamEvent[]): Anthropic.MessageParam[]`;
  `boardOf(events: StreamEvent[]): BoardState`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/api/test/thread-context.test.ts
import { describe, it, expect } from 'vitest';
import { describeBoard } from '@chalk/board';
import { mockTeach } from '@chalk/mock-tutor';
import type { StreamEvent } from '@chalk/schema';
import { boardOf, chatHistory } from '../src/threads/thread-context';

let seq = 0;
const ev = (kind: string, data: unknown): StreamEvent => ({ stream_id: 's', room_id: 'r', seq: ++seq, kind, data, actor: 'x', t: '' } as StreamEvent);

describe('chatHistory', () => {
  it('starts with the learner, alternates roles and merges repeats', () => {
    const h = chatHistory([
      ev('chat', { role: 'tutor', markdown: 'Hi, what about bumps?' }),
      ev('chat', { role: 'learner', markdown: 'Why 255?' }),
      ev('chat', { role: 'learner', markdown: 'And why down?' }),
      ev('board', { steps: [{ say: 'x' }] }),
      ev('chat', { role: 'tutor', markdown: 'Because...' }),
    ]);
    expect(h).toEqual([
      { role: 'user', content: 'Why 255?\n\nAnd why down?' },
      { role: 'assistant', content: 'Because...' },
    ]);
  });
});

describe('boardOf', () => {
  it('replays board and answer_cluster steps of the main stream', () => {
    const state = boardOf([
      ev('board', { steps: mockTeach(0).steps }),
      ev('segment_end', { segment: 0 }),
    ]);
    expect(describeBoard(state).shapes.map((s) => s.id)).toContain('pda');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/api/test/thread-context.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// packages/api/src/threads/thread-context.ts
// Pure context builders for the thread tutor.
import type Anthropic from '@anthropic-ai/sdk';
import { applySteps, emptyBoard, type BoardState } from '@chalk/board';
import type { BoardStep, StreamEvent, StreamEventDataOf } from '@chalk/schema';

/** Thread chat events as Messages API turns: starts with `user`, same-role lines merged. */
export function chatHistory(events: StreamEvent[]): Anthropic.MessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const e of events) {
    if (e.kind !== 'chat') continue;
    const d = e.data as StreamEventDataOf<'chat'>;
    const role = d.role === 'learner' ? 'user' : 'assistant';
    const last = out.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n\n${d.markdown}`;
    else out.push({ role, content: d.markdown });
  }
  while (out[0]?.role === 'assistant') out.shift();
  return out;
}

/** The main board as everyone sees it now: every board and Q&A step replayed in order. */
export function boardOf(events: StreamEvent[]): BoardState {
  let state = emptyBoard();
  for (const e of events) {
    if (e.kind === 'board' || e.kind === 'answer_cluster') state = applySteps(state, (e.data as { steps: BoardStep[] }).steps).state;
  }
  return state;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/api/test/thread-context.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/threads/thread-context.ts packages/api/test/thread-context.test.ts
git commit -m "feat(api): Add thread tutor context builders"
```

---

## Task 4 (B4): ThreadsService and the thread routes

**Files:**
- Create: `packages/api/src/threads/threads.service.ts`
- Modify: `packages/api/src/threads/threads.controller.ts` (replace the 501 stubs)
- Modify: `packages/api/src/app.module.ts`
- Modify: `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `ThreadStore` (Task 2), `chatHistory`, `boardOf` (Task 3), `RoomsService.prefixOf`,
  `ThreadTutorAgent.reply(ctx, text)`, `ConductorService.for(id).membersChanged()`.
- Produces: `ThreadsService.open(roomId, userId, body): Promise<ThreadRow>`,
  `message(threadId, userId, text): Promise<void>`, `close(threadId, userId): Promise<void>`,
  `share(threadId, userId, markdown?): Promise<ClusterRow>`.

- [ ] **Step 1: ThreadsService**

```ts
// packages/api/src/threads/threads.service.ts
// One personal side tutor per learner (design doc: Threads in detail). The reply runs in the
// background on a per-thread lane; the learner sees it arrive as `chat` / `board` events.
import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { describeBoard } from '@chalk/board';
import type { Api, ClusterRow, StreamEventDataOf, ThreadRow } from '@chalk/schema';
import { SupabaseService, must } from '../core/supabase.service';
import { EventsService } from '../core/events.service';
import { RoomsService } from '../rooms/rooms.service';
import { ConductorService } from '../conductor/conductor.service';
import { ThreadTutorAgent } from '../agents/thread-tutor.agent';
import { ThreadStore } from './thread-store';
import { boardOf, chatHistory } from './thread-context';

const greeting = (topic: string) => `Let's dig into **${topic}**. What would you like to know?`;
const SORRY = 'I could not answer that just now. Try asking again in a moment.';

@Injectable()
export class ThreadsService {
  private lanes = new Map<string, Promise<unknown>>();
  private log = new Logger('Threads');

  constructor(
    private supa: SupabaseService,
    private events: EventsService,
    private rooms: RoomsService,
    private store: ThreadStore,
    private tutor: ThreadTutorAgent,
    private conductor: ConductorService,
  ) {}

  private async owned(threadId: string, userId: string): Promise<ThreadRow> {
    const t = await this.store.get(threadId);
    if (t.owner_id !== userId) throw new ForbiddenException('only the thread owner can do this');
    return t;
  }

  async open(roomId: string, userId: string, body: z.infer<typeof Api.openThread>): Promise<ThreadRow> {
    await this.rooms.requireMember(roomId, userId);
    const room = await this.rooms.get(roomId);
    const leftMainSeq = await this.store.mainSeq(room);
    let thread: ThreadRow;
    if (body.threadId) {
      const offered = await this.owned(body.threadId, userId);
      if (offered.room_id !== roomId || offered.status !== 'offered') throw new ConflictException('that thread is not on offer');
      if (await this.store.hasActive(roomId, userId, ['open'])) throw new ConflictException('you already have an open thread');
      thread = await this.store.update(offered.id, { status: 'open', left_main_seq: leftMainSeq });
    } else {
      let topic = body.topic?.trim();
      if (body.questionId) {
        const q = await this.supa.db.from('questions').select('id, room_id, author_id, text').eq('id', body.questionId).maybeSingle();
        if (!q.data || q.data.room_id !== roomId) throw new NotFoundException('question not found');
        if (q.data.author_id !== userId) throw new ForbiddenException('you can only open a thread on your own question');
        topic = topic || (q.data.text as string);
        await this.supa.db.from('questions').update({ status: 'thread' }).eq('id', body.questionId);
      }
      thread = await this.store.createOpen(room, userId, topic || 'Side question', leftMainSeq);
    }
    await this.events.append(thread.stream_id, 'chat', { role: 'tutor', markdown: greeting(thread.topic) }, 'thread');
    void this.conductor.for(roomId).membersChanged();
    return thread;
  }

  /** Stores the learner line now; the tutor answers in the background, in order per thread. */
  async message(threadId: string, userId: string, text: string): Promise<void> {
    const t = await this.owned(threadId, userId);
    if (t.status !== 'open') throw new ConflictException('this thread is not open');
    const asked = await this.events.append(t.stream_id, 'chat', { role: 'learner', markdown: text, authorId: userId }, userId);
    const prev = this.lanes.get(threadId) ?? Promise.resolve();
    const next = prev.then(() => this.reply(t, text, asked.seq)).catch((e) => this.log.error(`thread ${threadId.slice(0, 8)}: ${(e as Error).stack ?? e}`));
    this.lanes.set(threadId, next);
  }

  private async reply(t: ThreadRow, text: string, askedSeq: number) {
    const room = await this.rooms.get(t.room_id);
    const [main, mine] = await Promise.all([this.events.after(room.main_stream_id), this.events.after(t.stream_id)]);
    try {
      const out = await this.tutor.reply({
        prefix: await this.rooms.prefixOf(room),
        mainBoard: describeBoard(boardOf(main)),
        topic: t.topic,
        history: chatHistory(mine.filter((e) => e.seq < askedSeq)),
      }, text);
      await this.events.append(t.stream_id, 'chat', { role: 'tutor', markdown: out.markdown }, 'thread');
      if (out.steps?.length) await this.events.append(t.stream_id, 'board', { steps: out.steps }, 'thread');
    } catch (e) {
      this.log.warn(`thread ${t.id.slice(0, 8)}: reply failed (${(e as Error).message})`);
      await this.events.append(t.stream_id, 'chat', { role: 'tutor', markdown: SORRY }, 'thread');
    }
  }

  /** Back to class (or decline an offer). The client shows the catch-up card from left_main_seq. */
  async close(threadId: string, userId: string): Promise<void> {
    const t = await this.owned(threadId, userId);
    if (t.status === 'closed') return;
    await this.store.update(t.id, { status: 'closed' });
    void this.conductor.for(t.room_id).membersChanged();
  }

  /** Share to class: the thread's best answer becomes an answered cluster in the rail. */
  async share(threadId: string, userId: string, markdown?: string): Promise<ClusterRow> {
    const t = await this.owned(threadId, userId);
    let answer = markdown?.trim();
    if (!answer) {
      const chats = (await this.events.after(t.stream_id)).filter((e) => e.kind === 'chat');
      const tutorLines = chats.map((e) => e.data as StreamEventDataOf<'chat'>).filter((d) => d.role === 'tutor' && d.markdown !== greeting(t.topic));
      answer = tutorLines.at(-1)?.markdown;
    }
    if (!answer) throw new ConflictException('nothing to share yet');
    answer = answer.slice(0, 2000);
    const cluster = must(await this.supa.db.from('clusters').insert({
      room_id: t.room_id, title: t.topic, route: 'inline', answer, answered: true, asker_count: 1,
    }).select('*').single(), 'share thread') as ClusterRow;
    await this.store.update(t.id, { shared_answer: answer });
    return cluster;
  }
}
```

- [ ] **Step 2: Replace the controller stubs**

```ts
// packages/api/src/threads/threads.controller.ts
// Threads: one personal side tutor per learner. Routes are fixed by @chalk/schema (Api.openThread etc.).
import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type ClusterRow, type ThreadRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { ThreadsService } from './threads.service';

@Controller()
@UseGuards(AuthGuard)
export class ThreadsController {
  constructor(private threads: ThreadsService) {}

  @Post('rooms/:id/threads')
  open(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.openThread)) b: z.infer<typeof Api.openThread>): Promise<ThreadRow> {
    return this.threads.open(id, u.id, b);
  }

  @Post('threads/:id/messages')
  @HttpCode(202)
  async message(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.threadMessage)) b: z.infer<typeof Api.threadMessage>) {
    await this.threads.message(id, u.id, b.text);
    return { ok: true };
  }

  @Post('threads/:id/close')
  @HttpCode(204)
  close(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.threads.close(id, u.id);
  }

  @Post('threads/:id/share')
  share(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.shareThread)) b: z.infer<typeof Api.shareThread>): Promise<ClusterRow> {
    return this.threads.share(id, u.id, b.markdown);
  }
}
```

Add `ThreadsService` to `providers` in `app.module.ts`.

- [ ] **Step 3: Extend the smoke test** (after the `segment 1 started` step)

```js
  const thread = await gio.call('POST', `/rooms/${room.id}/threads`, { topic: 'bump seeds' });
  await gio.call('POST', `/threads/${thread.id}/messages`, { text: 'Why does it start at 255?' });
  await waitFor(gio, (e) => e.stream_id === thread.stream_id && e.kind === 'chat' && e.data.role === 'tutor' && e.seq >= 3, 'the thread tutor reply');
  step('thread opened; the thread tutor replied');
  const check2 = await waitFor(ana, (e) => e.kind === 'check' && e.data.segment === 1, 'the second check');
  await ana.call('POST', `/rooms/${room.id}/ready`, { segment: 1 });
  await waitFor(ana, (e) => e.kind === 'check_closed' && e.data.checkId === check2.data.checkId, 'gate 2 without the thread owner');
  step('gate passed while Gio was in a thread');
  await gio.call('POST', `/threads/${thread.id}/close`, {});
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`, restart the API, `npm run smoke`.
Expected: PASSED with the two thread lines. Manual: `curl` a second open for the same user
returns 409; another user's token on `/threads/:id/messages` returns 403.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src scripts/smoke.mjs
git commit -m "feat(api): Implement threads: open, message, close, share" -m "Replies run on a per-thread lane with the shared room prefix, the main board and the chat history; owners of open threads stay excused at the gate."
```

## Checkpoint: M3 (Threads)
- [ ] Smoke green. Two browsers: a third question on one subtopic offers a thread; accepting it opens the drawer feed (Dev A) and the class keeps going.
- [ ] Agree with Dev A that shared clusters without questions show in the rail.
- [ ] Tick B4; PR `Lazare` to `main`.

---

## Task 5 (B3): Pure narration and notes builders

**Files:**
- Create: `packages/api/src/conductor/narration.ts`
- Create: `packages/api/src/notes/notes.ts`
- Test: `packages/api/test/narration.test.ts`, `packages/api/test/notes.test.ts`

**Interfaces:**
- Produces: `segmentTranscript(events, segment): string`; `checkResults(events): CheckResult[]`;
  `summariesOf(events): SummaryEntry[]`; `buildNotes(input: NotesInput): string[]`; types
  `CheckResult { segment; prompt; answerText; explanation?; correct; total }`,
  `SummaryEntry { segment; title; summary }`, `NotesInput`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/api/test/narration.test.ts
import { describe, it, expect } from 'vitest';
import { mockTeach } from '@chalk/mock-tutor';
import type { StreamEvent } from '@chalk/schema';
import { checkResults, segmentTranscript, summariesOf } from '../src/conductor/narration';

let seq = 0;
const ev = (kind: string, data: unknown): StreamEvent => ({ stream_id: 'm', room_id: 'r', seq: ++seq, kind, data, actor: 'lead', t: '' } as StreamEvent);
const seg0 = mockTeach(0);
const events = [
  ev('segment_start', { segment: 0, title: seg0.title }),
  ev('board', { steps: seg0.steps }),
  ev('check', { checkId: 'k0', segment: 0, question: { id: 'c1', type: 'mcq', prompt: 'Who can sign for a PDA?', options: ['a', 'b'] } }),
  ev('segment_end', { segment: 0 }),
  ev('segment_summary', { segment: 0, title: seg0.title, summary: 'S0' }),
  ev('check_closed', { checkId: 'k0', spread: { total: 2, correct: 1, counts: {} }, answer: 1, answerText: 'Only the program', explanation: 'No key.' }),
  ev('segment_start', { segment: 1, title: 'Finding the bump' }),
  ev('board', { steps: [{ say: 'Other segment.' }] }),
];

describe('narration', () => {
  it('collects only the segment narration and its check prompt', () => {
    const t = segmentTranscript(events, 0);
    expect(t).toContain('Normal accounts are owned by a keypair.');
    expect(t).toContain('Check: Who can sign for a PDA?');
    expect(t).not.toContain('Other segment.');
  });
  it('joins checks with their results', () => {
    expect(checkResults(events)).toEqual([{ segment: 0, prompt: 'Who can sign for a PDA?', answerText: 'Only the program', explanation: 'No key.', correct: 1, total: 2 }]);
  });
  it('lists summaries', () => {
    expect(summariesOf(events)).toEqual([{ segment: 0, title: seg0.title, summary: 'S0' }]);
  });
});
```

```ts
// packages/api/test/notes.test.ts
import { describe, it, expect } from 'vitest';
import { mockPlan } from '@chalk/mock-tutor';
import { buildNotes } from '../src/notes/notes';

describe('buildNotes', () => {
  it('writes one block per segment, then takeaways and class questions', () => {
    const blocks = buildNotes({
      plan: mockPlan(),
      summaries: [{ segment: 0, title: 'What is a PDA?', summary: 'A PDA has no key.' }],
      checks: [{ segment: 0, prompt: 'Who can sign?', answerText: 'The program', explanation: 'No key.', correct: 1, total: 2 }],
      clusters: [{ title: 'Why can a PDA not sign?', answer: 'It has no private key.', askers: 2 }],
    });
    expect(blocks).toHaveLength(5);
    expect(blocks[0]).toBe('## What is a PDA?\n\nA PDA has no key.');
    expect(blocks[1]).toContain('Describe how find_program_address picks the bump.');
    expect(blocks[3]).toContain('**Who can sign?** The program. No key. (1/2 of the class got it)');
    expect(blocks[4]).toContain('**Why can a PDA not sign?** (2 asked) It has no private key.');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/api/test/narration.test.ts packages/api/test/notes.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// packages/api/src/conductor/narration.ts
// Pure readers over the main stream's events, for the scribe and the notes.
import type { BoardStep, StreamEvent, StreamEventDataOf } from '@chalk/schema';

export interface CheckResult { segment: number; prompt: string; answerText: string; explanation?: string; correct: number; total: number }
export interface SummaryEntry { segment: number; title: string; summary: string }

/** What the class heard in one segment: its `say` lines and the check prompt. */
export function segmentTranscript(events: StreamEvent[], segment: number): string {
  const lines: string[] = [];
  let current = -1;
  for (const e of events) {
    if (e.kind === 'segment_start') current = (e.data as StreamEventDataOf<'segment_start'>).segment;
    else if (e.kind === 'segment_end' && current === segment) break;
    else if (current !== segment) continue;
    else if (e.kind === 'board') for (const s of (e.data as { steps: BoardStep[] }).steps) { if ('say' in s) lines.push(s.say); }
    else if (e.kind === 'check') lines.push(`Check: ${(e.data as StreamEventDataOf<'check'>).question.prompt}`);
  }
  return lines.join('\n');
}

export function checkResults(events: StreamEvent[]): CheckResult[] {
  const asked = new Map<string, { segment: number; prompt: string }>();
  const out: CheckResult[] = [];
  for (const e of events) {
    if (e.kind === 'check') {
      const d = e.data as StreamEventDataOf<'check'>;
      asked.set(d.checkId, { segment: d.segment, prompt: d.question.prompt });
    } else if (e.kind === 'check_closed') {
      const d = e.data as StreamEventDataOf<'check_closed'>;
      const a = asked.get(d.checkId);
      if (a) out.push({ ...a, answerText: d.answerText, explanation: d.explanation, correct: d.spread.correct, total: d.spread.total });
    }
  }
  return out;
}

export function summariesOf(events: StreamEvent[]): SummaryEntry[] {
  return events.filter((e) => e.kind === 'segment_summary').map((e) => e.data as StreamEventDataOf<'segment_summary'>);
}
```

```ts
// packages/api/src/notes/notes.ts
// Pure: end-of-class notes from data the class already produced (no extra model call).
import type { LessonPlan } from '@chalk/schema';
import type { CheckResult, SummaryEntry } from '../conductor/narration';

export interface NotesInput {
  plan: LessonPlan;
  summaries: SummaryEntry[];
  checks: CheckResult[];
  clusters: { title: string; answer: string | null; askers: number }[];
}

export function buildNotes({ plan, summaries, checks, clusters }: NotesInput): string[] {
  const blocks = plan.segments.map((s, i) => `## ${s.title}\n\n${summaries.find((x) => x.segment === i)?.summary ?? s.objective}`);
  if (checks.length) {
    blocks.push(['## Key takeaways', '', ...checks.map((c) =>
      `- **${c.prompt}** ${c.answerText}.${c.explanation ? ` ${c.explanation}` : ''} (${c.correct}/${c.total} of the class got it)`)].join('\n'));
  }
  const answered = clusters.filter((c) => c.answer);
  if (answered.length) {
    blocks.push(['## Questions from class', '', ...answered.map((c) => `- **${c.title}** (${c.askers} asked) ${c.answer}`)].join('\n'));
  }
  return blocks;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/api/test/narration.test.ts packages/api/test/notes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/conductor/narration.ts packages/api/src/notes/notes.ts packages/api/test/narration.test.ts packages/api/test/notes.test.ts
git commit -m "feat(api): Add segment narration and notes builders"
```

---

## Task 6 (B3): Scribe in the conductor, notes, FAQ and the notes route

**Files:**
- Modify: `packages/api/src/conductor/room-conductor.ts` (teach, passGate, qaBeat, end, recover)
- Modify: `packages/api/src/conductor/conductor.service.ts`
- Create: `packages/api/src/notes/notes.controller.ts`
- Modify: `packages/api/src/app.module.ts`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `segmentTranscript`, `checkResults`, `summariesOf`, `buildNotes` (Task 5);
  `ScribeAgent.summarize(prefix, title, transcript)`.
- Produces: `segment_summary` events; `note_blocks` rows; `faq` rows;
  `PUT /rooms/:id/notes/:blockId` returning `NoteBlockRow`.

- [ ] **Step 1: Conductor deps and state**

In `room-conductor.ts` add `scribe: ScribeAgent` to `ConductorDeps` (import type from
`../agents/scribe.agent`), the imports `import { checkResults, segmentTranscript, summariesOf } from './narration';`
and `import { buildNotes } from '../notes/notes';`, and the field:

```ts
  /** the scribe's summary of the last finished segment; awaited before the next segment */
  private pendingSummary: Promise<void> = Promise.resolve();
```

Pass `scribe: this.scribe` from `ConductorService` (inject `ScribeAgent`).

- [ ] **Step 2: Summarize without blocking the gate**

In `teach()`, replace the scribe TODO after the `segment_end` append with:

```ts
    this.pendingSummary = this.summarize(room, segment, plan.segments[segment].title);
```

Add the method:

```ts
  /** Never rejects: a missing summary must not break the class. */
  private async summarize(room: RoomRow, segment: number, title: string) {
    try {
      const events = await this.deps.events.after(room.main_stream_id);
      const asked = await this.db.from('questions').select('text').eq('room_id', room.id).eq('segment', segment);
      const questions = (asked.data ?? []).map((q) => `- ${q.text as string}`).join('\n');
      const transcript = [segmentTranscript(events, segment), questions && `Learners asked:\n${questions}`].filter(Boolean).join('\n\n');
      const summary = await this.deps.scribe.summarize(await this.prefix(room), title, transcript);
      await this.deps.events.append(room.main_stream_id, 'segment_summary', { segment, title, summary }, 'scribe');
      this.summaries.push(summary);
    } catch (e) {
      this.log.warn(`summary ${segment}: ${(e as Error).message}`);
    }
  }
```

In `passGate`, before `await this.teach(room, next);` add `await this.pendingSummary;`.

- [ ] **Step 3: Keep the class answer text**

In `qaBeat`, replace the cluster update with:

```ts
        const said = steps.flatMap((s) => ('say' in s ? [s.say] : [])).join(' ');
        await this.db.from('clusters').update({ answered: true, answer: said || null }).eq('id', c.id);
```

- [ ] **Step 4: Notes and FAQ at the end**

In `end()`, replace the TODO with:

```ts
    await this.pendingSummary;
    await this.writeNotes(room);
```

Add:

```ts
  private async writeNotes(room: RoomRow) {
    if (!room.lesson_plan) return; // ended from the lobby: nothing was taught
    const events = await this.deps.events.after(room.main_stream_id);
    const rows = await this.db.from('clusters').select('title, answer, asker_count').eq('room_id', room.id).or('answered.eq.true,route.eq.inline');
    const clusters = (rows.data ?? []).map((c) => ({ title: c.title as string, answer: c.answer as string | null, askers: c.asker_count as number }));
    const blocks = buildNotes({ plan: room.lesson_plan, summaries: summariesOf(events), checks: checkResults(events), clusters });
    const ins = await this.db.from('note_blocks').insert(blocks.map((markdown, idx) => ({ room_id: room.id, idx, markdown })));
    if (ins.error) this.log.error(`notes: ${ins.error.message}`);
    // P1: answered class questions become FAQ entries for the course
    const faq = clusters.filter((c) => c.answer);
    if (room.course_id && faq.length) {
      const f = await this.db.from('faq').insert(faq.map((c) => ({ course_id: room.course_id, topic_id: room.topic_id, question: c.title, answer: c.answer, askers_total: c.askers })));
      if (f.error) this.log.warn(`faq: ${f.error.message}`);
    }
  }
```

- [ ] **Step 5: Recover summaries after a restart**

At the start of `doRecover()` after loading the room:

```ts
    this.summaries = summariesOf(await this.deps.events.after(room.main_stream_id)).map((s) => s.summary);
```

- [ ] **Step 6: The notes route**

```ts
// packages/api/src/notes/notes.controller.ts
// Shared notes: anyone in the room edits a block; the version check stops lost updates.
import { Body, ConflictException, Controller, NotFoundException, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type NoteBlockRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { SupabaseService } from '../core/supabase.service';
import { RoomsService } from '../rooms/rooms.service';

@Controller()
@UseGuards(AuthGuard)
export class NotesController {
  constructor(private supa: SupabaseService, private rooms: RoomsService) {}

  @Put('rooms/:id/notes/:blockId')
  async edit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('blockId', ParseUUIDPipe) blockId: string,
    @Body(new ZodPipe(Api.editNote)) body: z.infer<typeof Api.editNote>): Promise<NoteBlockRow> {
    await this.rooms.requireMember(id, u.id);
    const r = await this.supa.db.from('note_blocks')
      .update({ markdown: body.markdown, version: body.version + 1, edited_by: u.id, updated_at: new Date().toISOString() })
      .eq('id', blockId).eq('room_id', id).eq('version', body.version).select('*');
    if (r.error) throw new Error(r.error.message);
    if (r.data?.length) return r.data[0] as NoteBlockRow;
    const exists = await this.supa.db.from('note_blocks').select('id').eq('id', blockId).eq('room_id', id).maybeSingle();
    if (!exists.data) throw new NotFoundException('note block not found');
    throw new ConflictException('someone else edited this block; reload it');
  }
}
```

Add `NotesController` to `controllers` in `app.module.ts`.

- [ ] **Step 7: Extend the smoke test**

After the thread lines add:

```js
  await waitFor(ana, (e) => e.kind === 'segment_summary' && e.data.segment === 0, 'the segment 0 summary');
  step('scribe summarized segment 0');
```

After the `host ended the class` step add:

```js
  const note = await waitRow(gio, (r) => r.table === 'note_blocks', 'shared notes');
  await gio.call('PUT', `/rooms/${room.id}/notes/${note.row.id}`, { markdown: 'edited', version: note.row.version });
  const stale = await fetch(`${API}/rooms/${room.id}/notes/${note.row.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${ana.token}` }, body: JSON.stringify({ markdown: 'late', version: note.row.version }) });
  if (stale.status !== 409) fail(`stale note edit returned ${stale.status}, expected 409`);
  step('notes written; a stale edit is rejected');
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm test`, restart the API, `npm run smoke`.
Expected: PASSED with the summary and notes lines.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src scripts/smoke.mjs
git commit -m "feat(api): Add scribe summaries, end-of-class notes and the notes route" -m "Summaries run after each segment without blocking the gate; notes are built from summaries, check results and answered clusters; course rooms also get FAQ rows."
```

---

## Task 7 (B5): Presence tracker and host successor (pure)

**Files:**
- Create: `packages/api/src/presence/presence-tracker.ts`
- Test: `packages/api/test/presence.test.ts`

**Interfaces:**
- Produces: `class PresenceTracker { constructor(leaveMs: number); sync(present: Set<string>, members: PresenceMember[], now: number): { leave: string[]; back: string[] } }`;
  `pickSuccessor(active: MemberRow[], hostId: string): MemberRow | null`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/api/test/presence.test.ts
import { describe, it, expect } from 'vitest';
import type { MemberRow } from '@chalk/schema';
import { PresenceTracker, pickSuccessor } from '../src/presence/presence-tracker';

describe('PresenceTracker', () => {
  it('marks a member left only after leaveMs of absence', () => {
    const t = new PresenceTracker(15_000);
    const members = [{ userId: 'a', active: true }, { userId: 'b', active: true }];
    expect(t.sync(new Set(['a']), members, 0)).toEqual({ leave: [], back: [] });
    expect(t.sync(new Set(['a']), members, 14_999)).toEqual({ leave: [], back: [] });
    expect(t.sync(new Set(['a']), members, 15_000)).toEqual({ leave: ['b'], back: [] });
  });
  it('forgets the absence when the member returns in time', () => {
    const t = new PresenceTracker(15_000);
    const members = [{ userId: 'b', active: true }];
    t.sync(new Set(), members, 0);
    t.sync(new Set(['b']), members, 5_000);
    expect(t.sync(new Set(), members, 16_000)).toEqual({ leave: [], back: [] });
  });
  it('reports an inactive member who is present again', () => {
    const t = new PresenceTracker(15_000);
    expect(t.sync(new Set(['b']), [{ userId: 'b', active: false }], 0)).toEqual({ leave: [], back: ['b'] });
  });
});

describe('pickSuccessor', () => {
  const m = (user_id: string, joined_at: string) => ({ user_id, joined_at } as MemberRow);
  it('picks the longest-present member who is not the host', () => {
    expect(pickSuccessor([m('h', '2026-01-01'), m('x', '2026-01-03'), m('y', '2026-01-02')], 'h')?.user_id).toBe('y');
  });
  it('returns null when nobody else is here', () => {
    expect(pickSuccessor([m('h', '2026-01-01')], 'h')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/api/test/presence.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// packages/api/src/presence/presence-tracker.ts
// Pure presence bookkeeping: a member absent from Supabase Presence for leaveMs has left;
// a member who reappears is back. Time is passed in, so tests need no timers.
import type { MemberRow } from '@chalk/schema';

export interface PresenceMember { userId: string; active: boolean }

export class PresenceTracker {
  private missingSince = new Map<string, number>();
  constructor(private leaveMs: number) {}

  sync(present: Set<string>, members: PresenceMember[], now: number): { leave: string[]; back: string[] } {
    const leave: string[] = [];
    const back: string[] = [];
    for (const m of members) {
      if (present.has(m.userId)) {
        this.missingSince.delete(m.userId);
        if (!m.active) back.push(m.userId);
        continue;
      }
      if (!m.active) { this.missingSince.delete(m.userId); continue; }
      const since = this.missingSince.get(m.userId);
      if (since === undefined) this.missingSince.set(m.userId, now);
      else if (now - since >= this.leaveMs) { leave.push(m.userId); this.missingSince.delete(m.userId); }
    }
    return { leave, back };
  }
}

/** Host handoff: the active member who joined first, excluding the host. */
export function pickSuccessor(active: MemberRow[], hostId: string): MemberRow | null {
  return active.filter((m) => m.user_id !== hostId).sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0] ?? null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/api/test/presence.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/presence/presence-tracker.ts packages/api/test/presence.test.ts
git commit -m "feat(api): Add presence tracker and host successor rule"
```

---

## Task 8 (B5): PresenceService, gate counting and host handoff

**Files:**
- Create: `packages/api/src/presence/presence.service.ts`
- Modify: `packages/api/src/rooms/rooms.service.ts` (`allMembers`, `setPresence`, `handOffHost`)
- Modify: `packages/api/src/rooms/rooms.controller.ts` (`leave`)
- Modify: `packages/api/src/conductor/conductor.service.ts`, `app.module.ts`
- Modify: `packages/api/src/conductor/room-conductor.ts:119` (remove the TODO)
- Modify: `scripts/smoke.mjs` (track presence; host handoff)

**Interfaces:**
- Consumes: `PresenceTracker`, `pickSuccessor` (Task 7).
- Produces: `PresenceService.watch(roomId)`, `unwatch(roomId)`, `onMembersChanged(fn)`;
  `RoomsService.handOffHost(roomId): Promise<MemberRow | null>`.

- [ ] **Step 1: Spike (10 minutes): can the service role read presence on a private channel?**

With `npm run dev` running and one browser in a room, run from the repo root:

```bash
node --env-file=.env -e '
import("@supabase/supabase-js").then(({ createClient }) => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const ch = db.channel("room:" + process.argv[1], { config: { private: true } });
  ch.on("presence", { event: "sync" }, () => console.log(Object.keys(ch.presenceState())))
    .subscribe((s, e) => console.log(s, e?.message ?? ""));
});' <room-uuid>
```

Expected: `SUBSCRIBED`, then an array with the browser user's id. If it prints
`CHANNEL_ERROR`, stop and switch to the fallback: a `POST /rooms/:id/heartbeat` (contract PR)
called every 5 s by the web, with the same `PresenceTracker` fed by heartbeat times.

- [ ] **Step 2: RoomsService helpers**

```ts
import { pickSuccessor } from '../presence/presence-tracker';

  /** Every member, including those who left. */
  async allMembers(roomId: string): Promise<MemberRow[]> {
    return must(await this.db.from('room_members').select('*').eq('room_id', roomId), 'members') as MemberRow[];
  }

  async setPresence(roomId: string, back: string[], gone: string[]) {
    if (back.length) await this.db.from('room_members').update({ left_at: null }).eq('room_id', roomId).in('user_id', back);
    if (gone.length) await this.db.from('room_members').update({ left_at: new Date().toISOString() }).eq('room_id', roomId).in('user_id', gone).is('left_at', null);
  }

  /** If the host is gone, the longest-present member takes over (design doc: Pacing). */
  async handOffHost(roomId: string): Promise<MemberRow | null> {
    const room = await this.get(roomId);
    if (room.phase === 'ended') return null;
    const active = await this.activeMembers(roomId);
    if (active.some((m) => m.user_id === room.host_id)) return null;
    const next = pickSuccessor(active, room.host_id);
    if (!next) return null;
    await this.update(roomId, { host_id: next.user_id });
    await this.db.from('room_members').update({ role: 'learner' }).eq('room_id', roomId).eq('user_id', room.host_id);
    await this.db.from('room_members').update({ role: 'host' }).eq('room_id', roomId).eq('user_id', next.user_id);
    await this.events.append(room.main_stream_id, 'notice', { text: `${next.display_name} is now the host.`, level: 'info' }, 'system');
    return next;
  }
```

- [ ] **Step 3: PresenceService**

```ts
// packages/api/src/presence/presence.service.ts
// The API listens to Supabase Presence on each watched room (service role) and keeps
// room_members.left_at in step with who is really here. The gate already counts left_at.
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { LIVE, roomTopic } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import { RoomsService } from '../rooms/rooms.service';
import { PresenceTracker } from './presence-tracker';

interface Watch { channel: RealtimeChannel; tracker: PresenceTracker; timer: ReturnType<typeof setInterval>; subscribed: boolean; busy: boolean }

@Injectable()
export class PresenceService implements OnModuleDestroy {
  private watches = new Map<string, Watch>();
  private listeners: ((roomId: string) => void)[] = [];
  private log = new Logger('Presence');

  constructor(private supa: SupabaseService, private rooms: RoomsService) {}

  /** ConductorService registers here (avoids a constructor cycle). */
  onMembersChanged(fn: (roomId: string) => void) { this.listeners.push(fn); }

  watch(roomId: string) {
    if (this.watches.has(roomId)) return;
    const channel = this.supa.db.channel(roomTopic(roomId), { config: { private: true } });
    const w: Watch = { channel, tracker: new PresenceTracker(LIVE.presenceLeaveMs), timer: setInterval(() => void this.check(roomId), 5_000), subscribed: false, busy: false };
    this.watches.set(roomId, w);
    channel
      .on('presence', { event: 'sync' }, () => void this.check(roomId))
      .subscribe((status, err) => {
        // count absences only once the channel is live, or an empty first state marks everyone gone
        if (status === 'SUBSCRIBED') w.subscribed = true;
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.log.warn(`room ${roomId.slice(0, 8)}: ${status} ${err?.message ?? ''}`);
      });
  }

  async unwatch(roomId: string) {
    const w = this.watches.get(roomId);
    if (!w) return;
    this.watches.delete(roomId);
    clearInterval(w.timer);
    await this.supa.db.removeChannel(w.channel);
  }

  private async check(roomId: string) {
    const w = this.watches.get(roomId);
    if (!w || !w.subscribed || w.busy) return;
    w.busy = true;
    try {
      const room = await this.rooms.get(roomId);
      if (room.phase === 'ended') { await this.unwatch(roomId); return; }
      const present = new Set(Object.keys(w.channel.presenceState()));
      const members = await this.rooms.allMembers(roomId);
      const { leave, back } = w.tracker.sync(present, members.map((m) => ({ userId: m.user_id, active: m.left_at === null })), Date.now());
      if (!leave.length && !back.length) return;
      await this.rooms.setPresence(roomId, back, leave);
      await this.rooms.handOffHost(roomId);
      for (const fn of this.listeners) fn(roomId);
    } catch (e) {
      this.log.warn(`room ${roomId.slice(0, 8)}: ${(e as Error).message}`);
    } finally {
      w.busy = false;
    }
  }

  async onModuleDestroy() {
    for (const id of [...this.watches.keys()]) await this.unwatch(id);
  }
}
```

- [ ] **Step 4: Wire it**

In `conductor.service.ts` inject `PresenceService`; in the constructor body register
`this.presence.onMembersChanged((id) => void this.for(id).membersChanged());`; in `for()`,
right after creating a new conductor, call `this.presence.watch(roomId);`.

In `rooms.controller.ts` `leave()`:

```ts
    await this.rooms.leave(id, u.id);
    await this.rooms.handOffHost(id);
    void this.conductor.for(id).membersChanged();
```

Delete the presence TODO comment in `room-conductor.ts` (line 119): `activeMembers` is now
presence-aware. Add `PresenceService` to `providers` in `app.module.ts`.

- [ ] **Step 5: Smoke tracks presence and checks the handoff**

In `subscribe()` give the channel a presence key and track after subscribing:

```js
    const ch = u.sb.channel(`room:${roomId}`, { config: { private: true, presence: { key: u.id } } })
      .on('broadcast', { event: 'event' }, ({ payload }) => u.events.push(payload))
      .on('broadcast', { event: 'row' }, ({ payload }) => u.rows.push(payload))
      .subscribe(async (s, err) => {
        if (s === 'SUBSCRIBED') {
          await ch.track({ userId: u.id, name: u.name, color: u.color, threadId: null, typing: false, onlineAt: new Date().toISOString() });
          resolve(ch);
        } else if (s === 'CHANNEL_ERROR') reject(new Error(`${u.name} channel: ${err?.message ?? s}`));
      });
```

Replace the end of the run (`ana` ends the class) with the handoff, then `gio` ends it:

```js
  await chA.untrack();
  await ana.call('POST', `/rooms/${room.id}/leave`, {});
  await waitRow(gio, (r) => r.table === 'rooms' && r.row.host_id === gio.id, 'host handoff');
  step('host passed to Gio when Ana left');
  await gio.call('POST', `/rooms/${room.id}/host`, { action: 'end' });
```

Keep the notes assertion from Task 6 after this.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`, restart, `npm run smoke`: PASSED.
Manual: two browsers in a class at a check; close one tab; within about 20 s the other
browser's ready vote passes the gate alone. Close the host's tab: the other browser gets the
host controls and the notice.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src scripts/smoke.mjs
git commit -m "feat(api): Count only present learners at the gate and hand off the host" -m "The API watches Supabase Presence per room, marks members absent for 15 s as left and back when they return, and passes the host role to the longest-present member."
```

## Checkpoint: M4 (Checks, Q&A, wrap-up)
- [ ] Smoke green; demo steps 5, 6, 7 work on two laptops (gate passes past the thread learner, credited Q&A answer, catch-up card from `segment_summary`, shared notes).
- [ ] Tick B3 and B5; PR `Lazare` to `main`.

---

## Task 9 (B1): Real model, usage metering, roomId on requests

**Files:**
- Create: `packages/api/src/agents/metered.model.ts`
- Modify: `packages/api/src/agents/model.port.ts`, `anthropic.model.ts`, `agents.module.ts`
- Modify: `packages/api/src/agents/{lead-tutor,triage,thread-tutor,scribe}.agent.ts` and their callers
- Modify: `.env.local` (not committed)

**Interfaces:**
- Produces: `ModelRequest.roomId?: string`; `ModelEvent` `done.usage.cacheWrite`;
  `UsageMeter.add(roomId, usage)`, `UsageMeter.total(roomId)`; `MeteredModel`.

- [ ] **Step 1: Key and health**

Add `ANTHROPIC_API_KEY=sk-ant-...` to `.env.local`, restart `npm run dev`.
Run: `curl -s localhost:3001/health`
Expected: `{"ok":true,"model":"anthropic","modelId":"claude-haiku-4-5"}`.

- [ ] **Step 2: Extend the port types**

In `model.port.ts`:

```ts
export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }

export interface ModelRequest {
  agent: AgentName;
  /** room the call is for: usage metering and the B6 budget */
  roomId?: string;
  // ...existing fields unchanged
}

  | { type: 'done'; stopReason: string | null; usage?: Usage };
```

In `anthropic.model.ts` set the usage with cache writes:

```ts
      usage: {
        input: msg.usage.input_tokens, output: msg.usage.output_tokens,
        cacheRead: msg.usage.cache_read_input_tokens ?? 0, cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
      },
```

and fix `FallbackModel` so a failure after partial tool JSON never replays the mock on top:

```ts
        if (e.type === 'tool' || e.type === 'tool_delta') produced = true;
```

- [ ] **Step 3: UsageMeter and MeteredModel**

```ts
// packages/api/src/agents/metered.model.ts
// Wraps the model: logs usage per call and keeps per-room totals (B6 adds the budget).
import { Injectable } from '@nestjs/common';
import { ModelPort, type ModelEvent, type ModelRequest, type Usage } from './model.port';

@Injectable()
export class UsageMeter {
  private rooms = new Map<string, Usage>();
  add(roomId: string, u: Usage) {
    const t = this.rooms.get(roomId) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    this.rooms.set(roomId, { input: t.input + u.input, output: t.output + u.output, cacheRead: t.cacheRead + u.cacheRead, cacheWrite: t.cacheWrite + u.cacheWrite });
  }
  /** input + output tokens spent by a room (cache reads count as input) */
  total(roomId: string): number {
    const t = this.rooms.get(roomId);
    return t ? t.input + t.cacheRead + t.cacheWrite + t.output : 0;
  }
}

export class MeteredModel extends ModelPort {
  readonly name: string;
  constructor(private inner: ModelPort, private meter: UsageMeter, private log: (m: string) => void) {
    super();
    this.name = inner.name;
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const started = Date.now();
    for await (const e of this.inner.stream(req)) {
      if (e.type === 'done' && e.usage) {
        if (req.roomId) this.meter.add(req.roomId, e.usage);
        const u = e.usage;
        this.log(`${req.agent} ${req.tool.name} room=${req.roomId?.slice(0, 8) ?? '-'} in=${u.input} out=${u.output} cacheRead=${u.cacheRead} cacheWrite=${u.cacheWrite} ${Date.now() - started}ms`);
      }
      yield e;
    }
  }
}
```

In `agents.module.ts` add `UsageMeter` to `providers` and `exports`, and wrap both branches
of the factory:

```ts
    {
      provide: ModelPort,
      inject: [UsageMeter],
      useFactory: (meter: UsageMeter) => {
        const usage = (m: string) => log.log(m);
        if (config.model === 'mock') {
          log.log('Using the scripted mock tutor (MODEL=mock)');
          return new MeteredModel(new MockModel(), meter, usage);
        }
        log.log(`Using ${config.modelId}, falling back to the mock tutor on errors`);
        return new MeteredModel(new FallbackModel(new AnthropicModel(), new MockModel(), (m) => log.warn(m)), meter, usage);
      },
    },
```

- [ ] **Step 4: Pass roomId from every agent call**

- `LeadTutorAgent.plan(prefix, title, roomId)`, `answerCluster(prefix, title, questions, askers, roomId)`,
  `TeachContext.roomId: string`; add `roomId` to each `callValidated` request object.
- `TriageInput.roomId: string`; `ThreadContext.roomId: string`; `ScribeAgent.summarize(prefix, title, transcript, roomId)`.
- Callers: `RoomConductor` (`room.id` in `doStart`, `teach`, `qaBeat`, `summarize`),
  `TriageService.run` (`roomId`), `ThreadsService.reply` (`t.room_id`).

- [ ] **Step 5: Verify and measure caching**

Run: `npm run typecheck && npm test`; restart; `npm run smoke` with the key set (it now uses
Claude; it may take longer) and again with `MODEL=mock npm run dev:api`.
Read the `[Model]` log lines. Expected: one line per call. Record in this file under
"Measurements" below: `cacheRead` on the second `teach_segment` call of a room. Haiku 4.5 caches
only prefixes of 4096 tokens or more, and tools render before `system`, so a zero here is likely
and not a bug. Do not pad prompts to force it; note the per-class cost instead.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src
git commit -m "feat(api): Meter model usage per room and agent" -m "MeteredModel logs input, output and cache tokens for every call; agents pass roomId; FallbackModel no longer replays the mock after partial tool output."
```

---

## Task 10 (B1): Stream board steps as the model writes them

**Files:**
- Create: `packages/api/src/agents/step-streamer.ts`, `packages/api/src/agents/teach-stream.ts`
- Modify: `packages/api/src/agents/lead-tutor.agent.ts` (`teach`, `TeachChunk`)
- Test: `packages/api/test/step-streamer.test.ts`, `packages/api/test/teach-stream.test.ts`

**Interfaces:**
- Produces: `class StepStreamer { push(chunk: string): unknown[] }`;
  `streamTeach(model: ModelPort, req: ModelRequest): AsyncGenerator<TeachChunk>`;
  `bySay(steps: BoardStep[]): BoardStep[][]`; `class InvalidTeach extends Error`;
  `type TeachChunk = { steps: BoardStep[] } | { check: Question }`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/api/test/step-streamer.test.ts
import { describe, it, expect } from 'vitest';
import { mockTeach } from '@chalk/mock-tutor';
import { StepStreamer } from '../src/agents/step-streamer';

const feed = (json: string, size: number) => {
  const s = new StepStreamer();
  const out: unknown[] = [];
  for (let i = 0; i < json.length; i += size) out.push(...s.push(json.slice(i, i + size)));
  return out;
};

describe('StepStreamer', () => {
  it('emits every element of steps, whatever the chunk size', () => {
    const seg = mockTeach(1); // has code with quotes, brackets and newlines
    for (const size of [1, 3, 17, 4096]) expect(feed(JSON.stringify(seg), size)).toEqual(seg.steps);
  });
  it('ignores arrays outside steps and tricky strings', () => {
    const json = '{"title":"a [b] {c} \\"steps\\"","x":[{"no":1}],"steps":[{"say":"} ] \\" {"},{"wait":1}],"check":{"options":[{"z":1}]}}';
    expect(feed(json, 2)).toEqual([{ say: '} ] " {' }, { wait: 1 }]);
  });
});
```

```ts
// packages/api/test/teach-stream.test.ts
import { describe, it, expect } from 'vitest';
import { mockTeach } from '@chalk/mock-tutor';
import { ModelPort, type ModelEvent, type ModelRequest } from '../src/agents/model.port';
import { InvalidTeach, bySay, streamTeach } from '../src/agents/teach-stream';

class FakeModel extends ModelPort {
  readonly name = 'fake';
  finalSent = false;
  constructor(private events: ModelEvent[]) { super(); }
  async *stream(): AsyncIterable<ModelEvent> {
    for (const e of this.events) { if (e.type === 'tool') this.finalSent = true; yield e; }
  }
}
const req = { agent: 'lead', prefix: '', system: '', messages: [], tool: { name: 'teach_segment', description: '', input_schema: {} }, mock: () => null } as ModelRequest;
const seg = mockTeach(0);
const deltas = (json: string, n: number): ModelEvent[] => Array.from({ length: Math.ceil(json.length / n) }, (_, i) => ({ type: 'tool_delta', partialJson: json.slice(i * n, i * n + n) }));

describe('streamTeach', () => {
  it('yields steps before the final tool input and loses nothing', async () => {
    const model = new FakeModel([...deltas(JSON.stringify(seg), 7), { type: 'tool', name: 'teach_segment', input: seg }, { type: 'done', stopReason: 'tool_use' }]);
    const chunks = [];
    let firstBeforeFinal: boolean | null = null;
    for await (const c of streamTeach(model, req)) { if (firstBeforeFinal === null) firstBeforeFinal = !model.finalSent; chunks.push(c); }
    expect(firstBeforeFinal).toBe(true);
    expect(chunks.flatMap((c) => ('steps' in c ? c.steps : []))).toEqual(seg.steps);
    expect(chunks.at(-1)).toEqual({ check: seg.check });
  });
  it('behaves like before for the mock (no deltas)', async () => {
    const model = new FakeModel([{ type: 'tool', name: 'teach_segment', input: seg }, { type: 'done', stopReason: 'tool_use' }]);
    const chunks = [];
    for await (const c of streamTeach(model, req)) chunks.push(c);
    expect(chunks.filter((c) => 'steps' in c).map((c) => ('steps' in c ? c.steps : []))).toEqual(bySay(seg.steps));
  });
  it('throws InvalidTeach when nothing valid arrived, so the caller can repair', async () => {
    const model = new FakeModel([{ type: 'tool', name: 'teach_segment', input: { title: 'x' } }]);
    await expect((async () => { for await (const _ of streamTeach(model, req)) { /* drain */ } })()).rejects.toBeInstanceOf(InvalidTeach);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/api/test/step-streamer.test.ts packages/api/test/teach-stream.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement StepStreamer**

```ts
// packages/api/src/agents/step-streamer.ts
// Pulls each complete element of the top-level "steps" array out of a tool input that arrives
// as partial JSON (ModelEvent.tool_delta). A tiny scanner: strings, escapes and nesting depth.
export class StepStreamer {
  private buf = '';
  private i = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private strStart = -1;
  /** last string closed at depth 1: the current key of the top-level object */
  private key = '';
  private inSteps = false;
  private elStart = -1;

  push(chunk: string): unknown[] {
    this.buf += chunk;
    const out: unknown[] = [];
    for (; this.i < this.buf.length; this.i++) {
      const ch = this.buf[this.i];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === '\\') this.escaped = true;
        else if (ch === '"') {
          this.inString = false;
          if (this.depth === 1) this.key = this.buf.slice(this.strStart + 1, this.i);
        }
        continue;
      }
      if (ch === '"') { this.inString = true; this.strStart = this.i; continue; }
      if (ch === '{' || ch === '[') {
        this.depth++;
        if (ch === '[' && this.depth === 2 && this.key === 'steps') this.inSteps = true;
        else if (this.inSteps && this.depth === 3) this.elStart = this.i;
      } else if (ch === '}' || ch === ']') {
        if (this.inSteps && this.depth === 3 && this.elStart >= 0) {
          try { out.push(JSON.parse(this.buf.slice(this.elStart, this.i + 1))); } catch { /* the final input decides */ }
          this.elStart = -1;
        } else if (ch === ']' && this.inSteps && this.depth === 2) this.inSteps = false;
        this.depth--;
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Implement streamTeach**

```ts
// packages/api/src/agents/teach-stream.ts
// teach_segment, streamed: each complete step is validated and drawn as soon as it is written
// (UX rule 6); the final tool input is still validated in full and fills any gap. The mock
// emits no deltas, so it takes the final-input path and behaves exactly as before.
import { BoardStep, Question, TeachSegment } from '@chalk/schema';
import type { ModelPort, ModelRequest } from './model.port';
import { StepStreamer } from './step-streamer';

export type TeachChunk = { steps: BoardStep[] } | { check: Question };

/** Nothing valid arrived: the caller runs the repair pass (callValidated). */
export class InvalidTeach extends Error {}

/** Chunks that end at a `say` step, so the board fills progressively. */
export function bySay(steps: BoardStep[]): BoardStep[][] {
  const out: BoardStep[][] = [];
  let chunk: BoardStep[] = [];
  for (const s of steps) {
    chunk.push(s);
    if ('say' in s) { out.push(chunk); chunk = []; }
  }
  if (chunk.length) out.push(chunk);
  return out;
}

export async function* streamTeach(model: ModelPort, req: ModelRequest): AsyncGenerator<TeachChunk> {
  const streamer = new StepStreamer();
  let pending: BoardStep[] = [];
  let streamed = 0;
  let broken = false;
  let final: unknown;
  for await (const ev of model.stream(req)) {
    if (ev.type === 'tool') { final = ev.input; continue; }
    if (ev.type !== 'tool_delta' || broken) continue;
    for (const raw of streamer.push(ev.partialJson)) {
      const step = BoardStep.safeParse(raw);
      if (!step.success) { broken = true; break; }
      pending.push(step.data);
      streamed++;
      if ('say' in step.data) { yield { steps: pending }; pending = []; }
    }
  }
  const out = TeachSegment.safeParse(final);
  if (!out.success) {
    if (!streamed) throw new InvalidTeach(`teach_segment invalid: ${out.error.issues[0]?.message ?? 'no input'}`);
    if (pending.length) yield { steps: pending };
    const check = Question.safeParse((final as { check?: unknown } | undefined)?.check);
    if (check.success) yield { check: check.data };
    return;
  }
  for (const steps of bySay([...pending, ...out.data.steps.slice(streamed)])) yield { steps };
  if (out.data.check) yield { check: out.data.check };
}
```

- [ ] **Step 5: Use it in LeadTutorAgent**

In `lead-tutor.agent.ts`: import `{ InvalidTeach, bySay, streamTeach, type TeachChunk } from './teach-stream'`,
delete the local `TeachChunk` type and re-export it (`export type { TeachChunk } from './teach-stream';`),
and replace `teach()`:

```ts
  async *teach(ctx: TeachContext): AsyncGenerator<TeachChunk> {
    const seg = ctx.plan.segments[ctx.segment];
    const notes = [
      `Teach segment ${ctx.segment}: "${seg.title}". Objective: ${seg.objective}`,
      ctx.slower ? 'The host asked to go slower: smaller steps, simpler words.' : '',
      ctx.lastCheck ? `Last check "${ctx.lastCheck.prompt}": ${ctx.lastCheck.spread.correct}/${ctx.lastCheck.spread.total} correct (answer: ${ctx.lastCheck.answerText}).` : '',
      ctx.summaries.length ? `So far:\n${ctx.summaries.join('\n')}` : '',
    ].filter(Boolean).join('\n');
    const req = {
      agent: 'lead' as const, roomId: ctx.roomId, prefix: ctx.prefix, system: PROMPTS.lead, tool: teachTool,
      messages: [{ role: 'user' as const, content: `${notes}\n\nCall teach_segment.` }],
      mock: () => mockTeach(ctx.segment),
    };
    try {
      yield* streamTeach(this.model, req);
    } catch (e) {
      if (!(e instanceof InvalidTeach)) throw e;
      const out = await callValidated(this.model, req, TeachSegment);
      for (const steps of bySay(out.steps)) yield { steps };
      if (out.check) yield { check: out.check };
    }
  }
```

The conductor already handles `'steps' in chunk` and `'check' in chunk`; nothing else changes.

- [ ] **Step 6: Verify**

Run: `npx vitest run packages/api/test/step-streamer.test.ts packages/api/test/teach-stream.test.ts`: PASS (5 tests).
`npm run typecheck && npm test`; `MODEL=mock` smoke: PASSED. With the key: start a class and
compare the `[Model] lead teach_segment` log time with the first `board` event's `t` in
Studio; the first board event is stored well before the call finishes (target about 2 s).

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/agents packages/api/test/step-streamer.test.ts packages/api/test/teach-stream.test.ts
git commit -m "feat(api): Stream board steps as the lead tutor writes them"
```

---

## Task 11 (B1): Pipeline the next segment

**Files:**
- Create: `packages/api/src/conductor/prefetch.ts`
- Modify: `packages/api/src/conductor/room-conductor.ts` (`teach`)
- Test: `packages/api/test/prefetch.test.ts`

**Interfaces:**
- Produces: `class ChunkBuffer<T> implements AsyncIterable<T>`; `prefetch<T>(source: AsyncIterable<T>): ChunkBuffer<T>`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/test/prefetch.test.ts
import { describe, it, expect } from 'vitest';
import { prefetch } from '../src/conductor/prefetch';

async function* slow(items: number[], fail = false) {
  for (const i of items) { await new Promise((r) => setTimeout(r, 5)); yield i; }
  if (fail) throw new Error('boom');
}

describe('prefetch', () => {
  it('buffers ahead and replays everything in order, even mid-stream', async () => {
    const buf = prefetch(slow([1, 2, 3]));
    await new Promise((r) => setTimeout(r, 8)); // consumer arrives late
    const got: number[] = [];
    for await (const x of buf) got.push(x);
    expect(got).toEqual([1, 2, 3]);
  });
  it('rethrows the source error after the buffered items', async () => {
    const got: number[] = [];
    await expect((async () => { for await (const x of prefetch(slow([1], true))) got.push(x); })()).rejects.toThrow('boom');
    expect(got).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/api/test/prefetch.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// packages/api/src/conductor/prefetch.ts
// Pipelining (design doc: Pacing): the next segment is written while the class sits at the
// gate, then replayed, still streaming if unfinished. One consumer per buffer.
export class ChunkBuffer<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private done = false;
  private error: unknown = null;
  private wake: (() => void) | null = null;

  push(x: T) { this.items.push(x); this.wake?.(); }
  close(error: unknown = null) { this.done = true; this.error = error; this.wake?.(); }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let i = 0;
    for (;;) {
      if (i < this.items.length) { yield this.items[i++]; continue; }
      if (this.done) { if (this.error) throw this.error; return; }
      await new Promise<void>((r) => { this.wake = r; });
      this.wake = null;
    }
  }
}

export function prefetch<T>(source: AsyncIterable<T>): ChunkBuffer<T> {
  const buf = new ChunkBuffer<T>();
  void (async () => {
    try { for await (const x of source) buf.push(x); buf.close(); } catch (e) { buf.close(e); }
  })();
  return buf;
}
```

- [ ] **Step 4: Use it in the conductor**

In `room-conductor.ts` import `{ prefetch, type ChunkBuffer } from './prefetch'` and
`type { TeachChunk } from '../agents/lead-tutor.agent'`, add the field and helpers:

```ts
  /** the next segment, written while the class is at the gate */
  private next: { segment: number; chunks: ChunkBuffer<TeachChunk> } | null = null;

  private async teachContext(room: RoomRow, segment: number, slower: boolean) {
    return { roomId: room.id, prefix: await this.prefix(room), plan: room.lesson_plan!, segment, slower, lastCheck: this.lastCheck, summaries: this.summaries };
  }

  /** Use the prefetched segment unless the host asked for Slower or the check went badly. */
  private takePrefetch(segment: number, slower: boolean): ChunkBuffer<TeachChunk> | null {
    const p = this.next;
    this.next = null;
    if (!p || p.segment !== segment || slower) return null;
    const s = this.lastCheck?.spread;
    if (s && s.total > 0 && s.correct / s.total < 0.5) return null;
    return p.chunks;
  }
```

In `teach()` replace the `for await` source and start the prefetch after `segment_end`:

```ts
      const source = this.takePrefetch(segment, slower) ?? this.deps.lead.teach(await this.teachContext(room, segment, slower));
      for await (const chunk of source) {
        // ...unchanged body
      }
    // after the segment_end append and the summary kickoff:
    if (segment + 1 < plan.segments.length) {
      this.next = { segment: segment + 1, chunks: prefetch(this.deps.lead.teach(await this.teachContext(room, segment + 1, false))) };
    }
```

- [ ] **Step 5: Verify**

Run: `npx vitest run packages/api/test/prefetch.test.ts`: PASS. `npm run typecheck && npm test`;
smoke PASSED in mock mode. With the key: after the gate passes, the next segment's first board
event appears within about 1 s.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/conductor packages/api/test/prefetch.test.ts
git commit -m "feat(api): Pipeline the next segment while the class is at the gate"
```

- [ ] **Step 7: Prompt tuning (manual, repeat until good)**

Run two full classes with the key on different topics. For each segment check: steps 6 to 14,
at most 10 shapes per page, no overlaps, `say` after drawing, a check that tests the objective.
Edit `packages/api/src/agents/prompts/*.md`; keep `classroom.md` and `board-script.md`
byte-stable during a class (they are the cached prefix). Commit as
`ref(api): Tune agent prompts`.

## Checkpoint: M5 part 1 (Real model)
- [ ] Mock smoke and a real class both work; usage lines logged; caching measured and noted below.
- [ ] Tick B1.

---

## Task 12 (B6): Budget, simple-mode retry, moderation, abuse mute

**Files:**
- Modify (contract PR, alone): `packages/schema/src/live.ts`
- Create: `supabase/migrations/<timestamp>_member_moderation.sql`
- Modify: `packages/api/src/config.ts`, `agents/metered.model.ts`, `agents/agents.module.ts`,
  `agents/lead-tutor.agent.ts`, `conductor/room-conductor.ts`, `conductor/conductor.service.ts`,
  `rooms/rooms.service.ts`, `rooms/rooms.controller.ts`, `questions/questions.controller.ts`,
  `triage/triage.service.ts`

**Interfaces:**
- Produces: `Api.moderate`; `MemberRow.muted`, `MemberRow.banned`;
  `POST /rooms/:id/moderate`; `UsageMeter.onBudgetExceeded(fn)`; `TeachContext.simple?: boolean`.

- [ ] **Step 1: Contract PR (merge before the rest)**

In `live.ts`, `MemberRow` gains two fields and `Api` one body:

```ts
export interface MemberRow {
  // ...existing fields
  /** host muted this member: they cannot ask */
  muted: boolean;
  /** host removed this member: they cannot rejoin or read the room */
  banned: boolean;
}

  /** POST /rooms/:id/moderate (host) */
  moderate: z.object({ userId: z.string().uuid(), action: z.enum(['mute', 'unmute', 'kick']) }),
```

Commit `feat(schema): Add host moderation contract`, open a PR to `main`, get Dev A's review.

- [ ] **Step 2: Migration**

Run: `npx supabase migration new member_moderation`, then put in the new file:

```sql
-- Host moderation: mute (cannot ask) and kick (cannot rejoin or read the room).
alter table public.room_members
  add column muted boolean not null default false,
  add column banned boolean not null default false;

-- banned members lose read access and realtime delivery
create or replace function public.is_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.room_members m where m.room_id = p_room and m.user_id = auth.uid() and not m.banned);
$$;
```

Run: `npm run db:reset` (local only). Expected: migrations and seed apply cleanly.

- [ ] **Step 3: Moderation in rooms and questions**

`RoomsService`:

```ts
  async moderate(roomId: string, userId: string, action: 'mute' | 'unmute' | 'kick') {
    const patch = action === 'kick' ? { banned: true, left_at: new Date().toISOString() } : { muted: action === 'mute' };
    const r = await this.db.from('room_members').update(patch).eq('room_id', roomId).eq('user_id', userId).select('user_id');
    if (!r.data?.length) throw new NotFoundException('not a member of this room');
  }
```

In `join()`, after loading `existing`: `if (existing?.banned) throw new ForbiddenException('you were removed from this room');`

`RoomsController`:

```ts
  @Post(':id/moderate')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async moderate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.moderate)) body: z.infer<typeof Api.moderate>) {
    await this.rooms.requireHost(id, u.id);
    if (body.userId === u.id) throw new BadRequestException('you cannot moderate yourself');
    await this.rooms.moderate(id, body.userId, body.action);
    if (body.action === 'kick') await this.rooms.handOffHost(id);
    void this.conductor.for(id).membersChanged();
  }
```

In `QuestionsController.ask`, after `requireMember`: `if (member.muted) throw new ForbiddenException('the host muted you in this room');`

- [ ] **Step 4: Abuse auto-mute in triage**

At the end of `TriageService.apply`:

```ts
    if (plan.questions.some((q) => q.status === 'flagged')) {
      const rows = must(await this.db.from('questions').select('author_id').eq('room_id', room.id).eq('status', 'flagged'), 'flags') as { author_id: string }[];
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.author_id, (counts.get(r.author_id) ?? 0) + 1);
      const spammers = [...counts].filter(([, n]) => n >= 3).map(([id]) => id);
      if (spammers.length) await this.db.from('room_members').update({ muted: true }).eq('room_id', room.id).in('user_id', spammers);
    }
```

- [ ] **Step 5: Per-room budget**

`config.ts`: `roomTokenBudget: Number(process.env.ROOM_TOKEN_BUDGET ?? 300_000),`

`metered.model.ts`: give `UsageMeter` an exceeded hook and `MeteredModel` a budget:

```ts
  private exceeded = new Set<string>();
  private listeners: ((roomId: string) => void)[] = [];
  onBudgetExceeded(fn: (roomId: string) => void) { this.listeners.push(fn); }
  /** first call over budget for a room notifies once */
  overBudget(roomId: string, budget: number): boolean {
    if (this.total(roomId) < budget) return false;
    if (!this.exceeded.has(roomId)) { this.exceeded.add(roomId); for (const fn of this.listeners) fn(roomId); }
    return true;
  }
```

```ts
export class MeteredModel extends ModelPort {
  readonly name: string;
  constructor(private inner: ModelPort, private meter: UsageMeter, private log: (m: string) => void,
    private budget?: { tokens: number; fallback: ModelPort }) {
    super();
    this.name = inner.name;
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const source = this.budget && req.roomId && this.meter.overBudget(req.roomId, this.budget.tokens) ? this.budget.fallback : this.inner;
    // ...existing loop over source.stream(req) instead of this.inner.stream(req)
  }
}
```

In `agents.module.ts`, the anthropic branch passes `{ tokens: config.roomTokenBudget, fallback: new MockModel() }`.
In `ConductorService` constructor (inject `UsageMeter`):

```ts
    meter.onBudgetExceeded((roomId) => void this.roomsService.get(roomId)
      .then((room) => this.events.append(room.main_stream_id, 'notice', { text: 'This class reached its AI budget; the backup tutor takes over.', level: 'warn' }, 'system'))
      .catch(() => undefined));
```

- [ ] **Step 6: Simple-mode retry for invalid Board Script**

`TeachContext` gains `simple?: boolean`; in `LeadTutorAgent.teach` add to `notes`:
`ctx.simple ? 'Keep the board simple: use only page, text, box, sticky and say steps.' : ''`.

In `RoomConductor.teach`, count appended chunks and retry once if nothing was drawn:

```ts
    let drawn = 0;
    const run = async (source: AsyncIterable<TeachChunk>) => {
      for await (const chunk of source) {
        drawn++;
        // ...existing body (board append, check insert + append)
      }
    };
    try {
      await run(this.takePrefetch(segment, slower) ?? this.deps.lead.teach(await this.teachContext(room, segment, slower)));
    } catch (e) {
      this.log.error(`teach ${segment}: ${(e as Error).message}`);
      let recovered = false;
      if (!drawn && /invalid teach_segment/.test((e as Error).message)) {
        try { await run(this.deps.lead.teach({ ...(await this.teachContext(room, segment, slower)), simple: true })); recovered = true; }
        catch (e2) { this.log.error(`teach ${segment} (simple): ${(e2 as Error).message}`); }
      }
      if (!recovered) await this.notice(room, 'The tutor had trouble with this segment. Ask a question, or the host can skip ahead.', 'warn');
    }
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test`; restart; smoke PASSED.
Manual checks: with `ROOM_TOKEN_BUDGET=1` and a key, the first call notices the budget and the
mock teaches; `curl` moderate kick, then the kicked user's join returns 403 and their
`rooms` select returns no rows; a muted user's ask returns 403.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src supabase/migrations
git commit -m "feat(api): Add room token budget, simple-mode retry and host moderation"
```

---

## Task 13 (B7): Deploy

**Files:**
- Modify: `packages/api/src/config.ts` (port), `packages/api/package.json` (runtime deps)
- Modify: `scripts/smoke.mjs` (`SMOKE_ENV`)
- Create: `vercel.json` (repo root)

- [ ] **Step 1: Code changes for hosting**

`config.ts`: `port: Number(process.env.PORT ?? process.env.API_PORT ?? 3001),`

`packages/api/package.json`: move `@swc-node/register` and `@swc/core` from
`devDependencies` to `dependencies` (the start script needs them at runtime), then `npm install`.

`scripts/smoke.mjs` line 10: read `process.env.SMOKE_ENV ?? '.env'` instead of `'.env'`.

`vercel.json`:

```json
{
  "installCommand": "npm ci",
  "buildCommand": "npm run build -w @chalk/web",
  "outputDirectory": "packages/web/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Tell Dev A about `vercel.json` (it shapes their build). Commit `build: Prepare API and web for hosting`.

- [ ] **Step 2: Hosted Supabase**

1. Dashboard: Authentication, Sign In / Providers: turn on anonymous sign-ins.
2. Project Settings, API Keys: copy the secret key into `SUPABASE_SERVICE_ROLE_KEY` in `.env.production.local`.
3. Run: `npm run db:push:prod -- --dry-run`. Expected: the migrations not yet applied are listed.
4. Run: `npm run db:push:prod` (ask the team first: this changes the shared database).
5. Seed the demo course: `set -a; . ./.env.production.local; set +a; psql "$DATABASE_URL" -f supabase/seed.sql`.

- [ ] **Step 3: API host (Railway or Render, one instance)**

Service from the GitHub repo, root directory = repo root. Build `npm ci`; start
`npm start -w @chalk/api`; health check `/health`; instances = 1 (the conductor lives in
memory). Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
`WEB_URL=<vercel url>`, `NODE_VERSION=22`. Expected: `/health` answers on the public URL.

- [ ] **Step 4: Web on Vercel**

Import the repo (root directory = repo root; `vercel.json` sets the rest). Env:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key), `VITE_API_URL=<api url>`.
Then set `WEB_URL` on the API to the Vercel URL and redeploy the API (CORS and invite links).

- [ ] **Step 5: Smoke against production**

Set `VITE_API_URL=<api url>` in `.env.production.local`, then:
Run: `SMOKE_ENV=.env.production.local npm run smoke`
Expected: PASSED. Then the demo on two phones by QR. Backup: set `MODEL=mock` on the API host.

## Checkpoint: M5 (Rehearsal)
- [ ] Production smoke green; one full rehearsal with the real model and one with `MODEL=mock`.
- [ ] Tick B6 and B7; PR `Lazare` to `main`.

---

## Task 14 (B8, P1 extra): Shared PDF with citations

Start only after M5. This task needs its own spec pass with Dev A, so its steps are the
decisions to make and the order to build in.

- [ ] **Step 1:** Read `packages/ingest` in `github.com/kotebibo/chalkroom` (v1) and note what it extracts (page text, images) and its dependencies.
- [ ] **Step 2: Contract PR:** `ResourceRow { id, room_id, course_id, title, pages, created_at }`; `Api.uploadResource` (multipart or signed upload URL); citation format stays `res:<id>#p<page>` (already in Board Script).
- [ ] **Step 3: Migration:** `resources` and `resource_pages(resource_id, page, text, tsv tsvector generated always as (to_tsvector('english', text)) stored)` with a GIN index; RLS read for members; a Storage bucket `resources` with member read.
- [ ] **Step 4: Ingest:** upload to Storage, extract text per page, insert `resource_pages`; test the extractor on a fixture PDF in `packages/api/test/fixtures`.
- [ ] **Step 5: Retrieval:** before each `teach_segment` and thread reply, `websearch_to_tsquery` on the segment objective or the question, top 3 pages, appended after the cached prefix (never inside it).
- [ ] **Step 6: Validation:** drop `source` values whose resource id or page does not exist before appending events.
- [ ] **Step 7:** Smoke: upload a fixture, teach, assert a `board` step with a valid `source`.

---

## Measurements (fill in during B1)

| Date | Measure | Value | Note |
|---|---|---|---|
| | `cacheRead` on the 2nd `teach_segment` call | | Haiku 4.5 needs a 4096-token prefix |
| | Time to first board event | | target about 2 s |
| | Tokens per full class (`UsageMeter.total`) | | sets `ROOM_TOKEN_BUDGET` |

## Self-review notes

- Spec coverage: B2 (Tasks 1-2), B4 (3-4), B3 (5-6), B5 (7-8), B1 (9-11), B6 (12), B7 (13),
  B8 (14). Design doc failure-handling rows: model error (FallbackModel, Task 9), invalid
  Board Script (Task 12), client drops (Task 8), restart (Tasks 2 and 6 recover paths),
  host leaves (Task 8), spam (Task 12).
- Names used across tasks: `RoomsService.prefixOf`, `ThreadStore`, `TriageService.schedule/runNow`,
  `planTriage`, `chatHistory`, `boardOf`, `segmentTranscript`, `checkResults`, `summariesOf`,
  `buildNotes`, `PresenceTracker`, `pickSuccessor`, `handOffHost`, `UsageMeter`, `MeteredModel`,
  `StepStreamer`, `streamTeach`, `bySay`, `InvalidTeach`, `TeachChunk`, `prefetch`, `ChunkBuffer`.
- Order inside the conductor file changes (Tasks 2, 6, 11, 12 all edit `teach()`): apply them
  in task order; Task 12 shows the final shape of the teach loop.

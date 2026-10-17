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
import { EMPTY_TRIAGE, planTriage, spammers, type TriageCluster, type TriagePlan } from './triage-plan';

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
        roomId,
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
    // B6: three flagged questions in a room mute their author
    if (plan.questions.some((q) => q.status === 'flagged')) {
      const rows = must(await this.db.from('questions').select('author_id').eq('room_id', room.id).eq('status', 'flagged'), 'flags') as { author_id: string }[];
      const mute = spammers(rows.map((r) => r.author_id));
      if (mute.length) await this.db.from('room_members').update({ muted: true }).eq('room_id', room.id).in('user_id', mute);
    }
  }
}

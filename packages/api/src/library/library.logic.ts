// lane L: pure rules of the library (chapters of a replay, kudos, the next lesson topic), kept
// apart from the database so they are unit-tested on plain rows.
import { parseSyllabus, type ClusterRow, type KudosRes, type QuestionRow, type ReplayChapter, type StreamEvent, type ThreadRow } from '@chalk/schema';

/** Jump points of a replay: every segment start, and every class question answered on the board. */
export function buildChapters(events: Pick<StreamEvent, 'seq' | 'kind' | 'data'>[]): ReplayChapter[] {
  const out: ReplayChapter[] = [];
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.kind === 'segment_start') out.push({ seq: e.seq, kind: 'segment', title: (e.data as StreamEvent<'segment_start'>['data']).title });
    else if (e.kind === 'answer_cluster') out.push({ seq: e.seq, kind: 'question', title: (e.data as StreamEvent<'answer_cluster'>['data']).title });
  }
  return out;
}

/** Minutes between start and end, at least 1; null when the class never ran. */
export function minutesBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 60_000));
}

type Q = Pick<QuestionRow, 'author_id' | 'cluster_id' | 'votes'>;
type C = Pick<ClusterRow, 'id' | 'route' | 'answered' | 'asker_count'>;

/**
 * Kudos: a question of mine helped when its cluster was answered for the class (on the board or
 * inline in the rail) and someone else shared it (another asker, or a +1). Each other asker and
 * each +1 is a person helped. Shared threads count separately.
 */
export function countKudos(me: string, questions: Q[], clusters: C[], threads: Pick<ThreadRow, 'owner_id' | 'shared_answer'>[]): KudosRes {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  let questionsHelped = 0;
  let peopleHelped = 0;
  for (const q of questions) {
    if (q.author_id !== me || !q.cluster_id) continue;
    const c = byId.get(q.cluster_id);
    if (!c || !c.answered || (c.route !== 'class' && c.route !== 'inline')) continue;
    const others = Math.max(0, c.asker_count - 1) + Math.max(0, q.votes);
    if (others <= 0) continue;
    questionsHelped++;
    peopleHelped += others;
  }
  const sharedThreads = threads.filter((t) => t.owner_id === me && !!t.shared_answer?.trim()).length;
  return { questionsHelped, peopleHelped, sharedThreads };
}

/**
 * The topic the next session continues with, in syllabus order: the one after the topic this
 * room taught; without a taught topic, the first topic not done yet. Null at the end of the course.
 */
export function nextTopicId(syllabusMd: string | undefined, taught: string | null): string | null {
  if (!syllabusMd) return null;
  const topics = parseSyllabus(syllabusMd).topics;
  if (!topics.length) return null;
  if (taught) {
    const i = topics.findIndex((t) => t.id === taught);
    if (i >= 0) return topics[i + 1]?.id ?? null;
  }
  return topics.find((t) => t.status !== 'done')?.id ?? null;
}

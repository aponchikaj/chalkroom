// A1 (Dev A): turns question, cluster and thread rows into rail cards (one per cluster, or one
// per unclustered question), with the status a learner should read and the order to show them.
import type { ClusterRow, QuestionRow, QuestionStatus, StreamEvent, ThreadRow } from '@chalk/schema';
import { joinNames } from '../../lib/text';

export interface RailCard {
  key: string;
  cluster: ClusterRow | null;
  /** oldest first */
  questions: QuestionRow[];
  title: string;
  status: QuestionStatus;
  /** an answer_cluster beat ran for this cluster on the main board */
  answeredInClass: boolean;
  /** display names to credit, in asking order */
  askers: string[];
  votes: number;
  latest: string;
  mine: boolean;
  /** a thread offered to me for this card (accept with api.openThread) */
  offered: ThreadRow | null;
  /** my open thread, when this card went to a thread */
  myThread: ThreadRow | null;
  /** my thread for this card has finished */
  threadDone: boolean;
  attention: boolean;
}

export interface RailInput {
  me: string | null;
  questions: Record<string, QuestionRow>;
  clusters: Record<string, ClusterRow>;
  threads: Record<string, ThreadRow>;
  answers: StreamEvent[];
}

export function buildCards({ me, questions, clusters, threads, answers }: RailInput): RailCard[] {
  const classAnswers = new Map<string, string[]>();
  for (const e of answers) {
    if (e.kind !== 'answer_cluster') continue;
    const d = (e as StreamEvent<'answer_cluster'>).data;
    classAnswers.set(d.clusterId, d.askers);
  }
  const mine = Object.values(threads).filter((t) => t.owner_id === me);
  const offered = mine.find((t) => t.status === 'offered') ?? null;
  const open = mine.find((t) => t.status === 'open') ?? null;

  const groups = new Map<string, QuestionRow[]>();
  for (const q of Object.values(questions)) {
    if (q.status === 'flagged' && q.author_id !== me) continue;
    const key = q.cluster_id ?? `q:${q.id}`;
    const list = groups.get(key);
    if (list) list.push(q); else groups.set(key, [q]);
  }

  const cards: RailCard[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const cluster = list[0].cluster_id ? clusters[list[0].cluster_id] ?? null : null;
    const live = list.filter((q) => q.status !== 'flagged');
    const status: QuestionStatus = !live.length ? 'flagged' : live.find((q) => q.status !== 'pending')?.status ?? 'pending';
    const credited = cluster ? classAnswers.get(cluster.id) : undefined;
    const isMine = list.some((q) => q.author_id === me);
    const myPending = list.some((q) => q.author_id === me && q.status === 'pending');
    const thread = status === 'thread' && isMine;
    const card: RailCard = {
      key,
      cluster,
      questions: list,
      title: cluster?.title || list[0].text,
      status,
      answeredInClass: !!credited || (!!cluster?.answered && cluster.route === 'class'),
      askers: credited ?? [...new Set(list.map((q) => q.author_name))],
      votes: list.reduce((n, q) => n + q.votes, 0),
      latest: list[list.length - 1].created_at,
      mine: isMine,
      offered: thread ? offered : null,
      myThread: thread ? open : null,
      threadDone: thread && !open && !offered && mine.some((t) => t.status === 'closed'),
      attention: false,
    };
    card.attention = myPending || !!card.offered;
    cards.push(card);
  }
  return cards.sort((a, b) => Number(b.attention) - Number(a.attention) || b.latest.localeCompare(a.latest));
}

/** "Gio asked this", "Gio and Mari asked this", "You, Gio and Mari asked this". */
export function creditLine(names: string[], myName: string | null) {
  const who = names.map((n) => (n === myName ? 'You' : n));
  const you = who.indexOf('You');
  if (you > 0) { who.splice(you, 1); who.unshift('You'); }
  if (!who.length) return '';
  return `${joinNames(who)} asked this`;
}

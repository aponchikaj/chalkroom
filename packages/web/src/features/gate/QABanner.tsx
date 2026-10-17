// A4 (Dev A): while phase === 'qa', a slim strip over the top of the board: how many class
// questions the tutor is answering, each with who asked (class clusters + answer_cluster events).
import { useMemo } from 'react';
import { MessagesSquare } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { StreamEvent } from '@chalk/schema';
import { useRoom, type RoomStore } from '../../room/store';
import './gate.css';

interface Item { id: string; title: string; askers: string[]; status: 'now' | 'done' | 'next' }

const list = (names: string[]) => names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

type Beat = Pick<RoomStore, 'mainEvents' | 'questions' | 'clusters'> & { segment: number };

function beatItems(s: Beat): Item[] {
  // this beat starts after the last check closed (or the last segment ended, if the check was skipped)
  const from = s.mainEvents.findLastIndex((e) => e.kind === 'check_closed' || e.kind === 'segment_end');
  const answers = s.mainEvents.slice(from + 1).filter((e) => e.kind === 'answer_cluster') as StreamEvent<'answer_cluster'>[];
  const items = new Map<string, Item>();
  answers.forEach((e, i) => items.set(e.data.clusterId, {
    id: e.data.clusterId, title: e.data.title, askers: e.data.askers, status: i === answers.length - 1 ? 'now' : 'done',
  }));
  const qs = Object.values(s.questions);
  for (const c of Object.values(s.clusters)) {
    if (c.route !== 'class' || items.has(c.id)) continue;
    const mine = qs.filter((q) => q.cluster_id === c.id);
    // waiting for this beat: not answered yet, or asked in this segment
    if (c.answered && !mine.some((q) => q.segment === s.segment)) continue;
    const askers = [...new Set(mine.map((q) => q.author_name))];
    items.set(c.id, { id: c.id, title: c.title, askers, status: 'next' });
  }
  return [...items.values()];
}

export function QABanner() {
  const phase = useRoom((s) => s.room?.phase);
  const beat = useRoom(useShallow((s) => ({ mainEvents: s.mainEvents, questions: s.questions, clusters: s.clusters, segment: s.room?.segment ?? 0 })));
  const items = useMemo(() => beatItems(beat), [beat]);
  if (phase !== 'qa') return null;
  const n = items.length;
  return (
    <section className="qa-banner acetate step-in" aria-label="Q&A" aria-live="polite">
      <MessagesSquare size={16} strokeWidth={2} aria-hidden />
      {n === 0 ? <p className="qa-count">No class questions this time. The next part starts shortly.</p> : <>
        <p className="qa-count">Answering <span className="mono">{n}</span> class question{n === 1 ? '' : 's'}</p>
        <ul className="qa-items">
          {items.map((it) => (
            <li key={it.id} className={`qa-item is-${it.status}`}>
              <span className="qa-title">{it.title}</span>
              {it.askers.length > 0 && <span className="qa-askers">asked by {list(it.askers)}</span>}
              {it.status === 'now' && <span className="qa-status">on the board</span>}
              {it.status === 'done' && <span className="qa-status">answered</span>}
            </li>
          ))}
        </ul>
      </>}
    </section>
  );
}

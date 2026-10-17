// A1 (Dev A): the question rail. Starting point: a bare list so the ask loop is visible.
// See docs/TASKS.md A1 for the real thing (clusters, status stamps, +1, credit, unmerge view).
import { useShallow } from 'zustand/react/shallow';
import { useRoom } from '../../room/store';

export function QuestionRail() {
  const questions = useRoom((s) => s.questions);
  const notices = useRoom(useShallow((s) => s.mainEvents.filter((e) => e.kind === 'notice')));
  const list = Object.values(questions).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="col" style={{ padding: 14 }}>
      {notices.slice(-3).map((n) => <p key={n.seq} className="faint">{(n.data as { text: string }).text}</p>)}
      {!list.length && <p className="empty">No questions yet. Ask anything, anytime.</p>}
      {list.map((q) => (
        <div key={q.id} className="leaf" style={{ padding: 12 }}>
          <div className="row faint"><span>{q.author_name}</span><span className="chip">{q.status}</span>{q.votes > 0 && <span>+{q.votes}</span>}</div>
          <p>{q.text}</p>
        </div>
      ))}
    </div>
  );
}

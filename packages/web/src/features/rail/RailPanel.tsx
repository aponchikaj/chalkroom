// Right column: Questions | Notes.
// The question list here is a bare first version so the ask → store → broadcast loop is
// visible end to end. TODO(frontend): the real question rail (docs/TASKS.md A1).
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useRoom } from '../room/store';

export function RightPanel() {
  const [tab, setTab] = useState<'questions' | 'notes'>('questions');
  return (
    <aside className="rightbar">
      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'questions'} onClick={() => setTab('questions')}>Questions</button>
        <button className="tab" role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>Notes</button>
      </div>
      <div className="scroll grow">{tab === 'questions' ? <QuestionList /> : <NotesPlaceholder />}</div>
    </aside>
  );
}

function QuestionList() {
  const questions = useRoom((s) => s.questions);
  const notices = useRoom(useShallow((s) => s.mainEvents.filter((e) => e.kind === 'notice')));
  const list = Object.values(questions).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <div className="chat">
      {notices.slice(-3).map((n) => <div key={n.seq} className="msg system">{(n.data as { text: string }).text}</div>)}
      {!list.length && <p className="empty">No questions yet. Ask anything, anytime.</p>}
      {list.map((q) => (
        <div key={q.id} className="q">
          <div className="q-meta"><span>{q.author_name}</span><span className="chip">{q.status}</span>{q.votes > 0 && <span>+{q.votes}</span>}</div>
          <div>{q.text}</div>
        </div>
      ))}
    </div>
  );
}

function NotesPlaceholder() {
  // TODO(frontend): shared notes (note_blocks), one editor per block shown by presence (docs/TASKS.md A5)
  return <p className="empty">The scribe's shared notes will appear here.</p>;
}

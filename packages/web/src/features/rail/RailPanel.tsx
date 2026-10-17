// The right-hand column: Questions and Notes as two divider tabs over one leaf.
// Contents belong to their features: QuestionRail (A1) and NotesPanel (A5).
import { useState } from 'react';
import { QuestionRail } from './QuestionRail';
import { NotesPanel } from '../notes/NotesPanel';
import { useRoom } from '../../room/store';

export function RailPanel() {
  const ended = useRoom((s) => s.room?.phase === 'ended');
  const [tab, setTab] = useState<'questions' | 'notes'>(ended ? 'notes' : 'questions');
  return (
    <aside className="rail" aria-label="Questions and notes">
      <div className="rail-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'questions'} className="rail-tab" onClick={() => setTab('questions')}>Questions</button>
        <button role="tab" aria-selected={tab === 'notes'} className="rail-tab" onClick={() => setTab('notes')}>Notes</button>
      </div>
      <div className="rail-body scroll" role="tabpanel">{tab === 'questions' ? <QuestionRail /> : <NotesPanel />}</div>
    </aside>
  );
}

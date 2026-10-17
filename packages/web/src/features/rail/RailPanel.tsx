// The right-hand column: Questions, Notes and Materials as divider tabs over one leaf.
// Contents belong to their features: QuestionRail (A1), NotesPanel (A5), MaterialsPanel (AM).
// AM: a citation chip pressed anywhere in the classroom opens the Materials tab.
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { QuestionRail } from './QuestionRail';
import { NotesPanel } from '../notes/NotesPanel';
import { MaterialsPanel } from '../materials/MaterialsPanel';
import { primeSources, useMaterials } from '../materials/store';
import { useRoom } from '../../room/store';

type Tab = 'questions' | 'notes' | 'materials';

export function RailPanel() {
  const ended = useRoom((s) => s.room?.phase === 'ended');
  const roomId = useRoom((s) => s.room?.id ?? null);
  const [tab, setTab] = useState<Tab>(ended ? 'notes' : 'questions');
  const focusN = useMaterials((s) => s.focus?.n ?? 0);
  const seen = useRef(focusN);

  useEffect(() => { if (roomId) primeSources(roomId); }, [roomId]);
  useEffect(() => {
    if (focusN === seen.current) return;
    seen.current = focusN;
    setTab('materials');
  }, [focusN]);

  return (
    <aside className="rail" aria-label="Questions, notes and materials">
      <div className="rail-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'questions'} className="rail-tab" onClick={() => setTab('questions')}>Questions</button>
        <button role="tab" aria-selected={tab === 'notes'} className="rail-tab" onClick={() => setTab('notes')}>Notes</button>
        <button role="tab" aria-selected={tab === 'materials'} className="rail-tab" onClick={() => setTab('materials')}>Materials</button>
      </div>
      <div className="rail-body scroll" role="tabpanel">
        {tab === 'questions' ? <QuestionRail /> : tab === 'notes' ? <NotesPanel /> : roomId ? <RailMaterials roomId={roomId} /> : null}
      </div>
    </aside>
  );
}

function RailMaterials({ roomId }: { roomId: string }) {
  const room = useRoom(useShallow((s) => (s.room ? { host_id: s.room.host_id, course_id: s.room.course_id } : null)));
  const me = useRoom((s) => s.me);
  const members = useRoom(useShallow((s) => Object.values(s.members)));
  return <MaterialsPanel roomId={roomId} room={room} me={me} members={members} compact />;
}

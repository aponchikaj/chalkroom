// A4 (Dev A): the ready gate strip. Who is ready, who is excused (in a thread), and the
// I'm ready action. Starting point only; A4 owns the design.
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { selectActiveMembers, selectReadyIds, useRoom } from '../../room/store';
import { api } from '../../lib/api';

export function ReadyStrip() {
  const room = useRoom((s) => s.room)!;
  const me = useRoom((s) => s.me)!;
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const ready = useRoom(useShallow((s) => [...selectReadyIds(s)]));
  const [error, setError] = useState('');
  if (room.phase !== 'check') return null;
  const mine = ready.includes(me);
  return (
    <div className="ready-strip" aria-label="Ready gate">
      <span className="faint">{ready.length} of {members.filter((m) => !presence[m.user_id]?.threadId).length} ready</span>
      <button className="btn primary" disabled={mine}
        onClick={() => api.ready(room.id, { segment: room.segment }).catch((e) => setError((e as Error).message))}>
        {mine ? 'Ready' : "I'm ready"}
      </button>
      {error && <span className="error-text" role="alert">{error}</span>}
    </div>
  );
}

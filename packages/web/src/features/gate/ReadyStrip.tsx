// A4 (Dev A): the ready gate in the control bar. Each learner's ready state as a punch, people
// in a thread excused (they never hold the class), "N of M ready" and the I'm ready action.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { selectActiveMembers, selectReadyIds, useRoom } from '../../room/store';
import { api } from '../../lib/api';
import { Punch } from '../../ui/Punch';
import { Stamp } from '../../ui/Stamp';
import './gate.css';

export function ReadyStrip() {
  const room = useRoom((s) => s.room)!;
  const me = useRoom((s) => s.me)!;
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const ready = useRoom(useShallow((s) => [...selectReadyIds(s)]));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  if (room.phase !== 'check') return null;

  const here = members.filter((m) => presence[m.user_id]);
  const excused = here.filter((m) => presence[m.user_id]?.threadId);
  const counted = here.filter((m) => !presence[m.user_id]?.threadId);
  const readyCount = counted.filter((m) => ready.includes(m.user_id)).length;
  const mine = ready.includes(me);
  const meExcused = !!presence[me]?.threadId;

  const vote = () => {
    setSending(true);
    api.ready(room.id, { segment: room.segment })
      .then(() => setError(''))
      .catch((e) => setError(`${(e as Error).message || 'Ready did not send.'} Press it again.`))
      .finally(() => setSending(false));
  };

  return (
    <div className="ready-strip" role="group" aria-label="Ready gate">
      <ul className="ready-people">
        {members.map((m) => {
          const p = presence[m.user_id];
          const state = !p ? 'away' : p.threadId ? 'excused' : ready.includes(m.user_id) ? 'ready' : 'waiting';
          return (
            <li key={m.user_id} className={`ready-person is-${state}`}>
              <Punch size="sm" name={m.display_name} color={m.color} present={!!p} ready={state === 'ready'} inThread={state === 'excused'} me={m.user_id === me} />
              <span className="ready-name">{m.user_id === me ? 'You' : m.display_name}<span className="ready-state">{state === 'waiting' ? '' : ` ${state}`}</span></span>
            </li>
          );
        })}
      </ul>
      <p className="ready-count" aria-live="polite">
        <span className="mono">{readyCount}</span> of <span className="mono">{counted.length}</span> ready
        {excused.length > 0 && <span className="faint">, {excused.length} excused</span>}
      </p>
      {room.gate_held && <p className="ready-held">The host paused the gate.</p>}
      {meExcused ? <Stamp tone="muted">Excused</Stamp>
        : mine ? <Stamp tone="ok" icon={<Check size={16} strokeWidth={2} aria-hidden />}>Ready</Stamp>
        : <button type="button" className="btn primary" disabled={sending} onClick={vote}>I'm ready</button>}
      {error && <p className="errata" role="alert">{error}</p>}
    </div>
  );
}

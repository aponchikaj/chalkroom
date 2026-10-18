// A4 (Dev A): the ready gate in the control bar. Each learner's ready state as a punch, people
// in a thread excused (they never hold the class), "N of M ready", the gate timer and the I'm
// ready action. The gate opens on this device only once the tutor has finished this part here
// (or the check is answered): nobody is asked to be ready while the pen is still moving.
import { useEffect, useState } from 'react';
import { Check, Timer } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { mainPlayer, selectActiveMembers, selectIsHost, selectPresentMembers, selectReadyIds, useRoom } from '../../room/store';
import { usePlayer } from '../../board/Board';
import { api } from '../../lib/api';
import { Punch } from '../../ui/Punch';
import { Stamp } from '../../ui/Stamp';
import { useHostAnswers } from '../check/hostAnswers';
import './gate.css';
import { nameFor } from '../../lib/text';

/** The gate is open on this device: the class is at a check and this device finished playing the
 *  part (or already answered the check). Host Skip uses the same rule. */
export function useGateOpenHere() {
  usePlayer(mainPlayer);
  const phase = useRoom((s) => s.room?.phase);
  const answered = useRoom((s) => !!s.check && !!s.answered[s.check.checkId]);
  return phase === 'check' && (!mainPlayer.busy || answered);
}

const IDLE: Partial<Record<string, string>> = {
  lobby: 'The class starts when the host presses Start.',
  teaching: 'Ready opens when the tutor finishes this part.',
  qa: 'Q&A: the tutor answers the class questions.',
};

export function ReadyStrip() {
  const room = useRoom((s) => s.room)!;
  const me = useRoom((s) => s.me)!;
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const ready = useRoom(useShallow((s) => [...selectReadyIds(s)]));
  const here = useRoom(useShallow(selectPresentMembers));
  const checkId = useRoom((s) => s.check?.checkId ?? null);
  const iAnswered = useRoom((s) => !!checkId && !!s.answered[checkId]);
  const isHost = useRoom(selectIsHost);
  const hostRows = useHostAnswers((s) => (checkId ? s.byCheck[checkId] : undefined));
  const gateOpen = useGateOpenHere();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  if (room.phase === 'ended') return null;
  if (room.phase !== 'check') {
    // phones only (gate.css): the strip's row is there from the lobby on, so the board does not
    // jump when a check opens; it says when Ready will come instead of standing empty
    return (
      <div className="ready-strip is-idle" role="status">
        <p className="ready-wait">{room.phase === 'lobby' && isHost ? 'Press Start class when everyone is here.' : IDLE[room.phase] ?? ''}</p>
      </div>
    );
  }

  if (!gateOpen) {
    return (
      <div className="ready-strip is-waiting" role="status">
        <p className="ready-wait">Ready opens when the tutor finishes this part.</p>
        {/* the class deadline already runs: a device whose narration lags still sees it */}
        <GateTimer deadline={room.gate_deadline} held={room.gate_held} />
      </div>
    );
  }

  const excused = here.filter((m) => presence[m.user_id]?.threadId);
  const counted = here.filter((m) => !presence[m.user_id]?.threadId);
  const readyCount = counted.filter((m) => ready.includes(m.user_id)).length;
  const mine = ready.includes(me);
  const meExcused = !!presence[me]?.threadId;
  // who answered the open check: always known for me; for others only the host reads it
  const answeredBy = (id: string): boolean | undefined =>
    !checkId ? undefined : id === me ? iAnswered : isHost && hostRows ? hostRows.some((r) => r.userId === id) : undefined;

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
          const noAnswer = state === 'ready' && answeredBy(m.user_id) === false;
          const word = state === 'waiting' ? '' : noAnswer ? 'ready, no answer' : state;
          return (
            <li key={m.user_id} className={`ready-person is-${state}${noAnswer ? ' no-answer' : ''}`}>
              <Punch size="sm" name={m.display_name} color={m.color} present={!!p} ready={state === 'ready'} inThread={state === 'excused'} me={m.user_id === me} />
              <span className="ready-name">{nameFor(m.user_id, m.display_name, me)}<span className="ready-state">{word ? ` ${word}` : ''}</span></span>
            </li>
          );
        })}
      </ul>
      <p className="ready-count" aria-live="polite">
        <span className="mono">{readyCount}</span> of <span className="mono">{counted.length}</span> ready
        {excused.length > 0 && <span className="faint">, {excused.length} excused</span>}
      </p>
      <GateTimer deadline={room.gate_deadline} held={room.gate_held} />
      {meExcused ? <Stamp tone="muted">Excused</Stamp>
        : mine ? <Stamp tone="ok" icon={<Check size={16} strokeWidth={2} aria-hidden />}>{checkId && !iAnswered ? 'Ready, no answer' : 'Ready'}</Stamp>
        : <button type="button" className="btn primary" disabled={sending} onClick={vote}
            title={checkId && !iAnswered ? 'You can be ready without answering. Submitting your answer also marks you ready.' : undefined}>
            I'm ready
          </button>}
      {error && <p className="errata" role="alert">{error}</p>}
    </div>
  );
}

/** Seconds left on the gate, inside the strip it belongs to. */
function GateTimer({ deadline, held }: { deadline: string | null; held: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!deadline || held) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [deadline, held]);
  if (held) return <p className="ready-held">The host paused the gate.</p>;
  if (!deadline) return null;
  const s = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
  return (
    <span className="gate-timer" title="The class moves on when everyone is ready or this runs out">
      <Timer size={14} strokeWidth={2} aria-hidden /><span className="mono">{s}s</span><span className="gate-timer-word"> left</span>
    </span>
  );
}

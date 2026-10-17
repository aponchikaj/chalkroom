// A4 (Dev A): host overrides. Start, Skip, Hold/Resume, Slower, End. The host rarely needs these
// (UX rule 5), so they stay quiet; End asks once inline because it ends the class for everyone.
import { useState } from 'react';
import { CircleStop, Pause, Play, SkipForward, Turtle } from 'lucide-react';
import { selectIsHost, useRoom } from '../../room/store';
import { api } from '../../lib/api';
import { Stamp } from '../../ui/Stamp';
import './gate.css';

type Action = Parameters<typeof api.host>[1]['action'];
const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

export function HostControls() {
  const room = useRoom((s) => s.room)!;
  const isHost = useRoom(selectIsHost);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [slowerFor, setSlowerFor] = useState<number | null>(null);
  const [error, setError] = useState('');
  if (!isHost || room.phase === 'ended') return null;

  const run = (key: string, p: () => Promise<unknown>, fail: string) => {
    setBusy(key);
    p().then(() => setError(''))
      .catch((e) => setError(`${fail} ${(e as Error).message || ''}`.trim()))
      .finally(() => setBusy(null));
  };
  const host = (action: Action, fail: string, after?: () => void) =>
    run(action, () => api.host(room.id, { action }).then(() => after?.()), fail);

  if (room.phase === 'lobby') {
    return (
      <div className="host-controls" role="group" aria-label="Host controls">
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => run('start', () => api.start(room.id), 'The class did not start. Press Start class again.')}>
          {busy === 'start' ? 'Starting' : 'Start class'}
        </button>
        {error && <p className="errata" role="alert">{error}</p>}
      </div>
    );
  }

  if (confirmEnd) {
    return (
      <div className="host-controls is-confirm" role="group" aria-label="Confirm end class">
        <p className="host-confirm-q">End the class for everyone?</p>
        <button type="button" className="btn danger" disabled={!!busy} autoFocus
          onClick={() => host('end', 'The class did not end. Try again.', () => setConfirmEnd(false))}>
          <CircleStop {...ICON} />{busy === 'end' ? 'Ending' : 'End class'}
        </button>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={() => setConfirmEnd(false)}>Keep teaching</button>
        {error && <p className="errata" role="alert">{error}</p>}
      </div>
    );
  }

  const slowerSet = slowerFor === room.segment;
  return (
    <div className="host-controls" role="group" aria-label="Host controls">
      <span className="host-label">Host</span>
      {room.phase === 'check' && <>
        <button type="button" className="btn small" disabled={!!busy} aria-label="Skip the gate" title="Skip the gate"
          onClick={() => host('skip', 'Skip did not go through. Try again.')}>
          <SkipForward {...ICON} /><span className="host-text">Skip</span>
        </button>
        {room.gate_held
          ? <button type="button" className="btn small" disabled={!!busy} aria-label="Resume the gate" title="Resume the gate"
              onClick={() => host('resume', 'The gate did not resume. Try again.')}>
              <Play {...ICON} /><span className="host-text">Resume</span>
            </button>
          : <button type="button" className="btn small" disabled={!!busy} aria-label="Hold the gate" title="Hold the gate"
              onClick={() => host('hold', 'The gate did not pause. Try again.')}>
              <Pause {...ICON} /><span className="host-text">Hold</span>
            </button>}
      </>}
      {slowerSet ? <Stamp tone="ink">Next part slower</Stamp> : (
        <button type="button" className="btn small" disabled={!!busy} aria-label="Slower: the next part re-explains" title="The next part re-explains"
          onClick={() => host('slower', 'Slower did not go through. Try again.', () => setSlowerFor(room.segment))}>
          <Turtle {...ICON} /><span className="host-text">Slower</span>
        </button>
      )}
      <button type="button" className="btn small ghost host-end" disabled={!!busy} aria-label="End class" title="End class" onClick={() => { setError(''); setConfirmEnd(true); }}>
        <CircleStop {...ICON} /><span className="host-text">End</span>
      </button>
      {error && <p className="errata" role="alert">{error}</p>}
    </div>
  );
}

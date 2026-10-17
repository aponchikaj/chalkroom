// Lane M: the host's buttons to start a quiz duel or a teach-back. Quiet secondary keys beside
// the host controls; disabled with a reason while the tutor is writing or an activity runs.
// Teach-back asks once inline for the concept (blank: the current segment's objective).
import { useMemo, useState } from 'react';
import { MessageSquareQuote, Timer } from 'lucide-react';
import { selectIsHost, useRoom } from '../../room/store';
import { api } from '../../lib/api';
import { currentActivity, isRunning } from './activityModel';
import { useNow } from './ActivityLayer';
import './activities.css';

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

export function ActivityControls() {
  const room = useRoom((s) => s.room);
  const isHost = useRoom(selectIsHost);
  const events = useRoom((s) => s.mainEvents);
  const now = useNow(isHost, 2000);
  const running = useMemo(() => isRunning(currentActivity(events, now)), [events, now]);
  const [busy, setBusy] = useState<'duel' | 'teachback' | null>(null);
  const [asking, setAsking] = useState(false);
  const [concept, setConcept] = useState('');
  const [error, setError] = useState('');
  if (!room || !isHost || room.phase === 'lobby' || room.phase === 'ended') return null;

  const reason = running ? 'An activity is running' : room.phase !== 'check' ? 'Available at the next check' : '';
  const objective = room.lesson_plan?.segments[room.segment]?.objective ?? '';
  const run = (which: 'duel' | 'teachback', p: () => Promise<unknown>, fail: string) => {
    setBusy(which);
    p().then(() => { setError(''); setAsking(false); setConcept(''); })
      .catch((e) => setError(`${fail} ${(e as Error).message || ''}`.trim()))
      .finally(() => setBusy(null));
  };

  if (asking) {
    return (
      <form className="activity-controls is-confirm" aria-label="Start a teach-back"
        onSubmit={(e) => { e.preventDefault(); run('teachback', () => api.startTeachback(room.id, concept.trim() ? { concept: concept.trim() } : {}), 'The teach-back did not start.'); }}>
        <label className="act-label" htmlFor="tb-concept">Teach-back on</label>
        <input id="tb-concept" className="input act-concept" maxLength={200} value={concept} onChange={(e) => setConcept(e.target.value)}
          placeholder={objective || 'The current part'} autoFocus />
        <button type="submit" className="btn primary small" disabled={!!busy || !!reason}>{busy ? 'Inviting' : 'Invite'}</button>
        <button type="button" className="btn ghost small" disabled={!!busy} onClick={() => { setAsking(false); setError(''); }}>Cancel</button>
        {error && <p className="errata" role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <div className="activity-controls" role="group" aria-label="Class activities" aria-describedby={reason ? 'act-reason' : undefined}>
      <button type="button" className="btn small" disabled={!!busy || !!reason} title={reason || 'Quiz duel: everyone answers against the clock'}
        onClick={() => run('duel', () => api.startDuel(room.id, { count: 5, secondsPerQuestion: 20 }), 'The duel did not start.')}>
        <Timer {...ICON} /><span>{busy === 'duel' ? 'Writing questions' : 'Quiz duel'}</span>
      </button>
      <button type="button" className="btn small" disabled={!!busy || !!reason} title={reason || 'Teach-back: a volunteer explains, the tutor adds what is missing'}
        onClick={() => { setError(''); setAsking(true); }}>
        <MessageSquareQuote {...ICON} /><span>Teach-back</span>
      </button>
      {reason && <span id="act-reason" className="act-reason">{reason}</span>}
      {error && <p className="errata" role="alert">{error}</p>}
    </div>
  );
}

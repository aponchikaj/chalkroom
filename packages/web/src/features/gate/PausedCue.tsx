// Lane C: while the host has the tutor paused, the stage says so where everyone is already
// looking (the captions slot under the board, a polite live region), for the host and the
// learners alike. The rail notice alone sits below the fold on phones.
import { Pause } from 'lucide-react';
import type { StreamEvent } from '@chalk/schema';
import { useRoom } from '../../room/store';
import { Stamp } from '../../ui/Stamp';

/** Who paused the tutor, while it stays paused: the actor of the last pause notice. */
function usePausedBy(): string | null {
  return useRoom((s) => {
    if (s.room?.phase === 'ended') return null;
    for (let i = s.mainEvents.length - 1; i >= 0; i--) {
      const e = s.mainEvents[i];
      if (e.kind !== 'notice') continue;
      const c = (e as StreamEvent<'notice'>).data.control;
      if (c === 'resume') return null;
      if (c === 'pause') return e.actor;
    }
    return null;
  });
}

/** "Paused by Ana": a stamp in the captions slot while the tutor is paused (null otherwise). */
export function PausedCue() {
  const by = usePausedBy();
  const me = useRoom((s) => s.me);
  const name = useRoom((s) => (by ? s.members[by]?.display_name : undefined));
  if (by === null) return null;
  const who = by === me ? 'you' : name ?? 'the host';
  return (
    <p className="paused-cue">
      <Stamp tone="ink" icon={<Pause size={14} strokeWidth={2.25} aria-hidden />}>Paused by {who}</Stamp>
      <span className="paused-cue-note">{by === me ? 'Press Resume tutor to go on.' : 'The board waits here until the host resumes.'}</span>
    </p>
  );
}

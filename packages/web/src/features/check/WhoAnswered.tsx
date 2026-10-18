// Lane C: the host's "Who answered" list under a check. While it is open: answered or no answer
// yet; once closed: right, wrong, waiting for the tutor to read it, or no answer. Host only; the
// class sees the anonymous spread.
import { useShallow } from 'zustand/react/shallow';
import { Check, Minus, X, Hourglass } from 'lucide-react';
import { selectActiveMembers, selectIsHost, useRoom } from '../../room/store';
import { useHostAnswers } from './hostAnswers';

const ICON = { size: 14, strokeWidth: 2.25, 'aria-hidden': true } as const;

export function WhoAnswered({ checkId, closed }: { checkId: string; closed: boolean }) {
  const isHost = useRoom(selectIsHost);
  const members = useRoom(useShallow(selectActiveMembers));
  const rows = useHostAnswers((s) => s.byCheck[checkId]);
  const failed = useHostAnswers((s) => s.failed[checkId]);
  if (!isHost) return null;

  return (
    <section className="who-answered" aria-label="Who answered (only you see this)">
      <h4 className="who-title">Who answered <span className="who-private">only you see this</span></h4>
      {!rows ? <p className="who-note">{failed ? 'Could not load the answers. Trying again.' : 'Loading answers.'}</p> : (
        <ul className="who-list">
          {members.map((m) => {
            const r = rows.find((x) => x.userId === m.user_id);
            const state = !r ? 'none' : !closed ? 'sent' : r.correct === true ? 'right' : r.correct === false ? 'wrong' : 'read';
            const word = { none: closed ? 'no answer' : 'no answer yet', sent: 'answered', right: 'correct', wrong: 'wrong', read: 'tutor reads it' }[state];
            return (
              <li key={m.user_id} className={`who-row is-${state}`}>
                <span className="who-dot" style={{ ['--who' as string]: m.color }} aria-hidden />
                <span className="who-name">{m.display_name}</span>
                <span className="who-state">
                  {state === 'right' || state === 'sent' ? <Check {...ICON} /> : state === 'wrong' ? <X {...ICON} /> : state === 'read' ? <Hourglass {...ICON} /> : <Minus {...ICON} />}
                  {word}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

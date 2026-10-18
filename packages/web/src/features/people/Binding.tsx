// A7 (Dev A): the binding edge: everyone in the class as punched holes, in arrival order. Seats left are
// unpunched rings, so "4 of 5 here" is visible without a number. The host also sees how many
// figures each person marked as lost (lane C), so they can tell who needs a hand.
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { selectActiveMembers, selectPresentMembers, selectReadyIds, useRoom } from '../../room/store';
import { Punch } from '../../ui/Punch';
import { nameFor } from '../../lib/text';
import { ModerateMenu } from './ModerateMenu';

export function Binding({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const room = useRoom((s) => s.room)!;
  const me = useRoom((s) => s.me);
  const ready = useRoom(useShallow((s) => [...selectReadyIds(s)]));
  const here = useRoom((s) => selectPresentMembers(s).length);
  const open = Math.max(0, room.seats - members.length);
  const isHost = room.host_id === me;
  const [menu, setMenu] = useState<string | null>(null);
  // host only: figures each person marked "confused" (reactions are visible to the room already)
  const lostIds = useRoom(useShallow((s) => {
    if (!s.room || s.room.host_id !== s.me || s.room.phase === 'lobby') return [] as string[];
    return s.reactions.filter((r) => r.kind === 'confused').map((r) => r.user_id);
  }));
  const lostBy = new Map<string, number>();
  for (const id of lostIds) lostBy.set(id, (lostBy.get(id) ?? 0) + 1);

  return (
    <section className={`binding binding-${orientation}`} aria-label={`People, ${here} of ${room.seats} here`}>
      <ul>
        {members.map((m) => {
          const canModerate = isHost && m.user_id !== me && room.phase !== 'ended';
          const showMuted = !!m.muted && (isHost || m.user_id === me);
          const lost = lostBy.get(m.user_id) ?? 0;
          const body = (
            <>
              <span className="binding-punch">
                <Punch name={m.display_name} color={m.color} me={m.user_id === me} host={m.user_id === room.host_id}
                  size={orientation === 'horizontal' ? 'sm' : 'md'} present={!!presence[m.user_id]} inThread={!!presence[m.user_id]?.threadId}
                  ready={room.phase === 'check' && ready.includes(m.user_id)} muted={showMuted} />
                {lost > 0 && orientation === 'horizontal' && (
                  <span className="binding-lost-badge mono" title={`${m.display_name} marked ${lost} figure${lost === 1 ? '' : 's'} as lost`}>
                    {lost}<span className="sr-only"> lost</span>
                  </span>
                )}
              </span>
              <span className="binding-name">{nameFor(m.user_id, m.display_name, me)}</span>
              {showMuted && <span className="binding-muted">Muted</span>}
              {lost > 0 && orientation === 'vertical' && (
                <span className="binding-lost" title={`${m.display_name} marked ${lost} figure${lost === 1 ? '' : 's'} as lost`}><span className="mono">{lost}</span> lost</span>
              )}
            </>
          );
          return (
            <li key={m.user_id}>
              {canModerate ? (
                <>
                  <button type="button" className="binding-person" aria-haspopup="menu" aria-expanded={menu === m.user_id}
                    aria-label={`${m.display_name}${lost ? `, ${lost} lost` : ''}: mute or remove`} onClick={() => setMenu(menu === m.user_id ? null : m.user_id)}>{body}</button>
                  {menu === m.user_id && <ModerateMenu member={m} onClose={() => setMenu(null)} />}
                </>
              ) : <div className="binding-person">{body}</div>}
            </li>
          );
        })}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open${i}`} className="binding-open" aria-hidden><span className="binding-ring" /></li>
        ))}
      </ul>
      <p className="binding-count"><span className="mono">{here}/{room.seats}</span> here</p>
    </section>
  );
}

// A7 (Dev A): the binding edge: everyone in the class as punched holes, in arrival order. Seats left are
// unpunched rings, so "4 of 5 here" is visible without a number.
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

  return (
    <section className={`binding binding-${orientation}`} aria-label={`People, ${here} of ${room.seats} here`}>
      <ul>
        {members.map((m) => (
          <li key={m.user_id}>
            {(() => {
              const canModerate = isHost && m.user_id !== me && room.phase !== 'ended';
              const showMuted = !!m.muted && (isHost || m.user_id === me);
              const body = (
                <>
                  <Punch name={m.display_name} color={m.color} me={m.user_id === me} host={m.user_id === room.host_id}
                    size={orientation === 'horizontal' ? 'sm' : 'md'} present={!!presence[m.user_id]} inThread={!!presence[m.user_id]?.threadId}
                    ready={room.phase === 'check' && ready.includes(m.user_id)} muted={showMuted} />
                  <span className="binding-name">{nameFor(m.user_id, m.display_name, me)}</span>
                  {showMuted && <span className="binding-muted">Muted</span>}
                </>
              );
              return canModerate ? (
                <>
                  <button type="button" className="binding-person" aria-haspopup="menu" aria-expanded={menu === m.user_id}
                    aria-label={`${m.display_name}: mute or remove`} onClick={() => setMenu(menu === m.user_id ? null : m.user_id)}>{body}</button>
                  {menu === m.user_id && <ModerateMenu member={m} onClose={() => setMenu(null)} />}
                </>
              ) : <div className="binding-person">{body}</div>;
            })()}
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open${i}`} className="binding-open" aria-hidden><span className="binding-ring" /></li>
        ))}
      </ul>
      <p className="binding-count"><span className="mono">{here}/{room.seats}</span> here</p>
    </section>
  );
}

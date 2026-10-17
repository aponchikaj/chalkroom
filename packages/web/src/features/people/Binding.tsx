// The binding edge: everyone in the class as punched holes, in arrival order. Seats left are
// unpunched rings, so "4 of 5 here" is visible without a number.
import { useShallow } from 'zustand/react/shallow';
import { selectActiveMembers, selectReadyIds, useRoom } from '../../room/store';
import { Punch } from '../../ui/Punch';

export function Binding({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const room = useRoom((s) => s.room)!;
  const me = useRoom((s) => s.me);
  const ready = useRoom(useShallow((s) => [...selectReadyIds(s)]));
  const here = members.filter((m) => presence[m.user_id]).length;
  const open = Math.max(0, room.seats - members.length);

  return (
    <section className={`binding binding-${orientation}`} aria-label={`People, ${here} of ${room.seats} here`}>
      <ul>
        {members.map((m) => (
          <li key={m.user_id}>
            <Punch name={m.display_name} color={m.color} me={m.user_id === me} host={m.user_id === room.host_id}
              present={!!presence[m.user_id]} inThread={!!presence[m.user_id]?.threadId}
              ready={room.phase === 'check' && ready.includes(m.user_id)} />
            <span className="binding-name">{m.user_id === me ? 'You' : m.display_name}</span>
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open${i}`} className="binding-open" aria-hidden><span className="binding-ring" /></li>
        ))}
      </ul>
      <p className="binding-count mono">{here}/{room.seats}</p>
    </section>
  );
}

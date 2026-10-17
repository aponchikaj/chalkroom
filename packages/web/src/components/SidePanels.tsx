import { useShallow } from 'zustand/react/shallow';
import { ArrowUpRight, Check, Circle, CircleDot } from 'lucide-react';
import { selectActiveMembers, selectReadyIds, useRoom } from '../room/store';

export function PeoplePanel() {
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const room = useRoom((s) => s.room)!;
  const ready = useRoom(useShallow((s) => [...selectReadyIds(s)]));
  const me = useRoom((s) => s.me);

  return (
    <div className="panel-section">
      <h3 className="section-title">People</h3>
      <ul className="people">
        {members.map((m) => {
          const p = presence[m.user_id];
          return (
            <li key={m.user_id} className={p ? '' : 'away'}>
              <span className="avatar" style={{ background: m.color }} aria-hidden>{m.display_name.slice(0, 1).toUpperCase()}</span>
              <span className="grow">{m.display_name}{m.user_id === me && <span className="faint"> (you)</span>}</span>
              {m.user_id === room.host_id && <span className="badge" title="Host">H</span>}
              {p?.threadId && <span title="In a thread"><ArrowUpRight size={14} aria-label="in a thread" /></span>}
              {room.phase === 'check' && ready.includes(m.user_id) && <span className="ok" title="Ready"><Check size={14} aria-label="ready" /></span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PlanPanel() {
  const room = useRoom((s) => s.room)!;
  const plan = room.lesson_plan;
  return (
    <div className="panel-section">
      <h3 className="section-title">Lesson</h3>
      {!plan ? <p className="faint">The tutor plans the lesson when the host starts the class.</p> : (
        <ol className="plan">
          {plan.segments.map((s, i) => {
            const state = room.phase === 'ended' || i < room.segment ? 'done' : i === room.segment && room.phase !== 'lobby' ? 'now' : 'todo';
            return (
              <li key={i} className={state} title={s.objective}>
                {state === 'done' ? <Check size={14} aria-label="done" /> : state === 'now' ? <CircleDot size={14} aria-label="now" /> : <Circle size={14} aria-label="to do" />} {s.title}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

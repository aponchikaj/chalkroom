// Home, "Your classes" tab: every class this learner joined or hosts, live first, then waiting,
// then ended by recency. Rejoin goes back into the room; the class page keeps what it left.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, RotateCw } from 'lucide-react';
import type { RoomRow } from '@chalk/schema';
import { fetchMyClasses, type MyClass } from '../../lib/library';
import { navigate } from '../../lib/router';
import { joined } from '../../lib/profile';
import { Stamp } from '../../ui/Stamp';

type State = 'live' | 'lobby' | 'ended';
const stateOf = (r: RoomRow): State => (r.phase === 'lobby' ? 'lobby' : r.phase === 'ended' ? 'ended' : 'live');
const STATE_WORDS: Record<State, string> = { live: 'Live now', lobby: 'Waiting to start', ended: 'Ended' };
const RANK: Record<State, number> = { live: 0, lobby: 1, ended: 2 };
const whenOf = (r: RoomRow) => Date.parse(r.started_at ?? r.created_at) || 0;

export type Load = { status: 'loading' } | { status: 'error'; text: string } | { status: 'ready'; classes: MyClass[] };

/** Loads my classes once on mount; `reload` tries again after an error. */
export function useMyClasses() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoad({ status: 'loading' });
    fetchMyClasses()
      .then((classes) => { if (alive) setLoad({ status: 'ready', classes: sortClasses(classes) }); })
      .catch((e: unknown) => {
        if (!alive) return;
        const text = e instanceof Error && /load your classes/i.test(e.message)
          ? 'Could not load your classes. The class server may be busy.'
          : 'Could not load your classes. Check your internet connection.';
        setLoad({ status: 'error', text });
      });
    return () => { alive = false; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { load, reload };
}

export function sortClasses(list: MyClass[]): MyClass[] {
  return [...list].sort((a, b) => RANK[stateOf(a.room)] - RANK[stateOf(b.room)] || whenOf(b.room) - whenOf(a.room));
}

const time = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "Today 10:12", "Yesterday 18:40", "12 Oct 09:05", "3 Mar 2025". */
function When({ iso, verb }: { iso: string; verb: string }) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  let day: string;
  let withTime = true;
  if (dayKey(d) === dayKey(now)) day = 'today';
  else if (dayKey(d) === dayKey(yesterday)) day = 'yesterday';
  else if (d.getFullYear() === now.getFullYear()) day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  else { day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); withTime = false; }
  return (
    <time dateTime={iso} title={d.toLocaleString()}>
      {verb} {day}{withTime && <> <span className="mono">{time(d)}</span></>}
    </time>
  );
}

function progress(r: RoomRow): string | null {
  const n = r.lesson_plan?.segments.length;
  if (!n) return null;
  if (r.phase === 'lobby') return `${n} ${n === 1 ? 'segment' : 'segments'} planned`;
  return `Segment ${Math.min(r.segment + 1, n)} of ${n}`;
}

const go = (path: string, before?: () => void) => (e: React.MouseEvent<HTMLAnchorElement>) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  before?.();
  navigate(path);
};

function ClassRow({ c }: { c: MyClass }) {
  const { room, member } = c;
  const state = stateOf(room);
  const prog = progress(room);
  const page = `/c/${room.id}`;
  const rejoin = `/r/${room.invite_code}`;
  return (
    <li className={`class-row class-${state}`}>
      <div className="class-main">
        <h3 className="class-title">{room.title || 'Untitled class'}</h3>
        <p className="class-meta">
          <Stamp tone={state === 'live' ? 'ok' : state === 'lobby' ? 'pending' : 'muted'}>{STATE_WORDS[state]}</Stamp>
          <span className="class-role">{member.role === 'host' ? 'Host' : 'Learner'}</span>
          <When iso={room.started_at ?? room.created_at} verb={room.started_at ? 'Started' : 'Opened'} />
          {prog && <span>{prog.split(/(\d+)/).map((p, i) => (i % 2 ? <span key={i} className="mono">{p}</span> : p))}</span>}
        </p>
      </div>
      <div className="class-actions">
        {state !== 'ended' && (
          <a className={`btn small${state === 'live' ? ' primary' : ''}`} href={rejoin}
            onClick={go(rejoin, () => joined.add(room.invite_code))}>
            Rejoin <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </a>
        )}
        <a className="btn small" href={page} onClick={go(page)}>Open class page</a>
      </div>
    </li>
  );
}

export function MyClasses({ load, reload, onSwitch }: { load: Load; reload: () => void; onSwitch: (tab: 'start' | 'join') => void }) {
  return (
    <section className="home-section" aria-labelledby="classes-title">
      <h2 id="classes-title">Your classes</h2>
      {load.status === 'loading' && (
        <ol className="class-list" aria-busy="true" aria-label="Loading your classes">
          {[0, 1, 2].map((i) => (
            <li key={i} className="class-row class-skeleton" aria-hidden>
              <div className="class-main"><i className="sk sk-title" /><i className="sk sk-meta" /></div>
              <div className="class-actions"><i className="sk sk-btn" /></div>
            </li>
          ))}
        </ol>
      )}
      {load.status === 'error' && (
        <div className="errata class-error" role="alert">
          <AlertTriangle size={16} strokeWidth={2} aria-hidden />
          <span className="grow">{load.text}</span>
          <button type="button" className="btn small" onClick={reload}><RotateCw size={14} strokeWidth={2} aria-hidden /> Try again</button>
        </div>
      )}
      {load.status === 'ready' && load.classes.length === 0 && (
        <p className="class-empty">
          No classes yet. <button type="button" className="text-link" onClick={() => onSwitch('start')}>Start one</button> or{' '}
          <button type="button" className="text-link" onClick={() => onSwitch('join')}>join with a code</button>.
        </p>
      )}
      {load.status === 'ready' && load.classes.length > 0 && (
        <ol className="class-list">
          {load.classes.map((c) => <ClassRow key={c.room.id} c={c} />)}
        </ol>
      )}
      {load.status === 'ready' && (
        <p className="form-note">Finished public classes from everyone play back in <a className="text-link" href="/replays" onClick={go('/replays')}>Replays</a>.</p>
      )}
    </section>
  );
}

// Lane C: Home, "Lobby" tab: open public classes with free seats, starting soonest first, then
// live ones. Ruled entries on the leaf; Join opens the class's pre-join page.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, RotateCw } from 'lucide-react';
import type { LobbyRoom } from '@chalk/schema';
import { api } from '../../lib/api';
import { navigate } from '../../lib/router';
import { Stamp } from '../../ui/Stamp';
import { Seats, startWords } from '../courses/shared';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rooms: LobbyRoom[] };

const REFRESH_MS = 15_000;

function When({ r }: { r: LobbyRoom }) {
  if (r.phase !== 'lobby') return <Stamp tone="ok">Live now</Stamp>;
  const s = startWords(r.starts_at);
  if (!s || Date.parse(r.starts_at!) <= Date.now()) return <Stamp tone="pending">Starting soon</Stamp>;
  return <span className="lobby-when">Starts {s.day} <span className="mono">{s.time}</span></span>;
}

export function Lobby({ onSwitch }: { onSwitch: (tab: 'start') => void }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const fetchIt = useCallback((quiet = false) => {
    if (!quiet) setLoad({ status: 'loading' });
    return api.lobby().then((rooms) => setLoad({ status: 'ready', rooms }), () => { if (!quiet) setLoad({ status: 'error' }); });
  }, []);
  useEffect(() => {
    void fetchIt();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void fetchIt(true); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchIt]);

  return (
    <section className="home-section" aria-labelledby="lobby-title">
      <div className="section-head">
        <h2 id="lobby-title">Open classes</h2>
        <button type="button" className="btn small ghost" onClick={() => void fetchIt()} disabled={load.status === 'loading'}>
          <RotateCw size={14} strokeWidth={2} aria-hidden /> Refresh
        </button>
      </div>
      <p className="form-note">Public classes with free seats. Join one and the host starts it when the group is in. Missed one? <a href="/replays">Watch finished classes</a>.</p>
      {load.status === 'loading' && (
        <ol className="class-list" aria-busy="true" aria-label="Loading open classes">
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
          <span className="grow">Could not load the lobby. Check your internet connection.</span>
          <button type="button" className="btn small" onClick={() => void fetchIt()}><RotateCw size={14} strokeWidth={2} aria-hidden /> Try again</button>
        </div>
      )}
      {load.status === 'ready' && !load.rooms.length && (
        <p className="class-empty">
          No open classes right now. <button type="button" className="text-link" onClick={() => onSwitch('start')}>Start a public class</button> and it shows up here.
        </p>
      )}
      {load.status === 'ready' && load.rooms.length > 0 && (
        <ol className="class-list">
          {load.rooms.map((r) => (
            <li key={r.id} className="class-row lobby-row">
              <div className="class-main">
                <h3 className="class-title">{r.title}</h3>
                {r.course_title && (
                  <a className="lobby-course" href={`/courses/${r.course_id}`}
                    onClick={(e) => { if (e.button || e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(`/courses/${r.course_id}`); }}>
                    {r.course_title}
                  </a>
                )}
                <p className="class-meta">
                  <When r={r} />
                  <Seats taken={r.taken} seats={r.seats} />
                  {r.host_name && <span>Host {r.host_name}</span>}
                </p>
              </div>
              <div className="class-actions">
                <a className="btn small" href={`/r/${r.invite_code}`}
                  onClick={(e) => { if (e.button || e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(`/r/${r.invite_code}`); }}>
                  Join <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </a>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

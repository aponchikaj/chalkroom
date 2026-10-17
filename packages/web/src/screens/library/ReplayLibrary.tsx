// Lane L: the replay library: finished public classes, with question chapters.
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, TriangleAlert } from 'lucide-react';
import type { ReplayCard } from '@chalk/schema';
import { api } from '../../lib/api';
import { navigate } from '../../lib/router';
import { sectionHue, sectionInk } from '../../ui/section';
import '../../ui/ui.css';
import './library.css';

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
type Load = { state: 'loading' } | { state: 'error'; text: string } | { state: 'ready'; list: ReplayCard[] };

const dateWords = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function ReplayLibrary() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const fetchIt = useCallback(() => {
    let live = true;
    setLoad({ state: 'loading' });
    api.replays()
      .then((list) => { if (live) setLoad({ state: 'ready', list }); })
      .catch((e: Error) => { if (live) setLoad({ state: 'error', text: e.message || 'Could not load the replays.' }); });
    return () => { live = false; };
  }, []);
  useEffect(() => fetchIt(), [fetchIt]);
  useEffect(() => { document.title = 'Replays · Chalkroom Live'; }, []);

  return (
    <div className="replay">
      <article className="replay-manual leaf punched replay-lib">
        <header className="replay-running">
          <button type="button" className="btn ghost small replay-back" onClick={() => navigate('/')}><ArrowLeft {...ICON} />Home</button>
          <span className="replay-brand">Chalkroom Live</span>
        </header>
        <div className="replay-head">
          <h1 className="replay-title">Replays</h1>
          <p className="replay-lede">Finished public classes, played back on the board. Each class question the tutor answered is a chapter to jump to.</p>
        </div>

        {load.state === 'loading' && (
          <div aria-busy="true"><p className="sr-only" role="status">Loading replays</p>{[0, 1, 2].map((k) => <span key={k} className="replay-bone replay-bone-row" />)}</div>
        )}
        {load.state === 'error' && (
          <div className="replay-problem">
            <p className="errata" role="alert"><TriangleAlert {...ICON} />{load.text} Check your connection, then try again.</p>
            <div className="replay-problem-actions"><button type="button" className="btn primary" onClick={fetchIt}><RotateCw {...ICON} />Try again</button></div>
          </div>
        )}
        {load.state === 'ready' && (load.list.length ? (
          <ol className="replay-list">
            {load.list.map((r, k) => (
              <li key={r.id}>
                <a className="replay-row" href={`/c/${r.id}/replay`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); navigate(`/c/${r.id}/replay`); }}
                  style={{ ['--hue' as string]: sectionHue(k), ['--on-hue' as string]: sectionInk(k) }}>
                  <span className="replay-row-tab" aria-hidden />
                  <span className="replay-row-main">
                    <span className="replay-row-title">{r.title}</span>
                    <span className="replay-row-sub">{r.course_title ?? 'Open topic'}{r.host_name ? `, hosted by ${r.host_name}` : ''}</span>
                  </span>
                  <span className="replay-row-facts">
                    <span>{dateWords(r.ended_at)}</span>
                    <span>{r.minutes != null ? <><span className="mono">{r.minutes}</span> min</> : 'Length unknown'}</span>
                    <span><span className="mono">{r.chapters}</span> chapter{r.chapters === 1 ? '' : 's'}</span>
                  </span>
                  <ArrowRight {...ICON} className="replay-row-go" />
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="replay-empty replay-empty-lg">No public class has finished yet. When one does, its replay appears here.</p>
        ))}
      </article>
    </div>
  );
}

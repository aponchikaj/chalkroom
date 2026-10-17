// Lane L: replay one finished class on the board, with chapters to jump to. The board comes
// back from the class's own events through a separate Player (never the live mainPlayer).
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, BookOpen, MessageCircleQuestion, Pause, Play, RotateCcw, RotateCw, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import type { ReplayChapter, ReplayRes } from '@chalk/schema';
import { api, ApiError } from '../../lib/api';
import { Player } from '../../lib/player';
import { navigate } from '../../lib/router';
import { usePrefStore } from '../../lib/preferences';
import { Board, usePlayer } from '../../board/Board';
import { sectionHue, sectionInk } from '../../ui/section';
import { ReplayDriver } from './replay';
import '../../ui/ui.css';
import './library.css';

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
const SPEEDS = [1, 1.5, 2] as const;

type Load = { state: 'loading' } | { state: 'error'; text: string; closed: boolean } | { state: 'ready'; res: ReplayRes };

const dateWords = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const mins = (a: string | null, b: string | null) => a && b ? Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60_000)) : null;

export function ReplayPlayer({ roomId }: { roomId: string }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ state: 'loading' });
    api.replay(roomId)
      .then((res) => { if (live) setLoad({ state: 'ready', res }); })
      .catch((e: Error) => {
        if (!live) return;
        const closed = e instanceof ApiError && (e.status === 403 || e.status === 404);
        setLoad({ state: 'error', closed, text: closed ? 'This replay is open to the class that took it, and to everyone once a public class has finished.' : e.message || 'Could not load the replay.' });
      });
    return () => { live = false; };
  }, [roomId, tick]);

  useEffect(() => {
    document.title = load.state === 'ready' ? `Replay: ${load.res.room.title} · Chalkroom Live` : 'Replay · Chalkroom Live';
  }, [load]);

  if (load.state === 'loading') return <Frame><p className="replay-wait" role="status">Opening the replay</p><span className="replay-bone" /></Frame>;
  if (load.state === 'error') {
    return (
      <Frame>
        <h1 className="replay-title">{load.closed ? 'Replay not open to you' : 'The replay did not open'}</h1>
        <p className="errata replay-errata" role="alert"><TriangleAlert {...ICON} />{load.text}</p>
        <div className="replay-problem-actions">
          {load.closed
            ? <button type="button" className="btn primary" onClick={() => navigate('/replays')}><BookOpen {...ICON} />Browse public replays</button>
            : <button type="button" className="btn primary" onClick={() => setTick((t) => t + 1)}><RotateCw {...ICON} />Try again</button>}
        </div>
      </Frame>
    );
  }
  return <Replay res={load.res} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="replay">
      <article className="replay-manual leaf punched">
        <header className="replay-running">
          <button type="button" className="btn ghost small replay-back" onClick={() => navigate('/replays')}><ArrowLeft {...ICON} />All replays</button>
          <span className="replay-brand">Chalkroom Live</span>
        </header>
        {children}
      </article>
    </div>
  );
}

function Replay({ res }: { res: ReplayRes }) {
  const { room, events, chapters } = res;
  const voiceRate = usePrefStore((s) => s.settings.voiceRate);
  const player = useMemo(() => new Player({ silent: true }), []);
  const driver = useMemo(() => new ReplayDriver(player, events), [player, events]);
  usePlayer(player);
  useSyncExternalStore(driver.subscribe, driver.getVersion);
  const [speed, setSpeed] = useState<number>(1);
  const [voice, setVoice] = useState(false);

  useEffect(() => { player.voiceRate = voiceRate; }, [player, voiceRate]);
  useEffect(() => () => driver.stop(), [driver]);

  const at = driver.atSeq;
  const first = driver.firstSeq;
  const last = driver.lastSeq;
  const pct = last > first ? Math.round(((Math.max(at, first) - first) / (last - first)) * 100) : 0;
  const current = chapterAt(chapters, at, driver.playing || player.busy);
  const segOf = useMemo(() => segmentIndex(chapters), [chapters]);
  const minutes = mins(room.started_at, room.ended_at);
  const done = driver.done && at >= last && last > 0;

  const setPace = (s: number) => { setSpeed(s); player.pace = s; };
  const toggleVoice = () => { const on = !voice; setVoice(on); player.setMuted(!on); };
  const jump = (c: ReplayChapter) => driver.seek(c.seq, true);
  const back = room.phase === 'ended' ? null : room;

  return (
    <div className="replay" style={{ ['--section' as string]: sectionHue(current ? segOf.get(current.seq) ?? 0 : 0) }}>
      <article className="replay-manual leaf punched">
        <header className="replay-running">
          <button type="button" className="btn ghost small replay-back" onClick={() => navigate('/replays')}><ArrowLeft {...ICON} />All replays</button>
          <span className="replay-brand">Chalkroom Live</span>
        </header>
        <div className="replay-head">
          <h1 className="replay-title">{room.title}</h1>
          <p className="replay-facts">
            <span>{dateWords(room.started_at ?? room.created_at)}</span>
            {minutes != null && <span><span className="mono">{minutes}</span> min</span>}
            <span><span className="mono">{chapters.length}</span> chapter{chapters.length === 1 ? '' : 's'}</span>
            {back && <span>Still running</span>}
          </p>
        </div>

        <div className="replay-body">
          <section className="replay-stage" aria-label="Board replay">
            <div className="replay-board">
              <Board player={player} id="replay-board" emptyHint={events.length ? 'Press play to replay the class' : 'This class left nothing on the board'} />
            </div>
            <p className="replay-captions" aria-live="polite">
              {player.caption || <span className="faint">{done ? 'The end of the class.' : driver.playing ? '' : 'Captions appear here while the tutor speaks.'}</span>}
            </p>

            <div className="replay-transport">
              <button type="button" className="btn primary replay-play" onClick={() => (driver.playing ? driver.pause() : driver.play())} disabled={!events.length}>
                {driver.playing ? <><Pause {...ICON} />Pause</> : done ? <><RotateCcw {...ICON} />Play again</> : <><Play {...ICON} />{at > first ? 'Resume' : 'Play'}</>}
              </button>
              <div className="replay-speed" role="group" aria-label="Speed">
                {SPEEDS.map((s) => (
                  <button key={s} type="button" className="btn small" aria-pressed={speed === s} onClick={() => setPace(s)}>
                    <span className="mono">{s}x</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn small" aria-pressed={voice} onClick={toggleVoice}>
                {voice ? <><Volume2 {...ICON} />Voice on</> : <><VolumeX {...ICON} />Voice off</>}
              </button>
              <label className="replay-progress">
                <span className="sr-only">Position in the class</span>
                <input type="range" min={first} max={Math.max(last, first + 1)} step={1} value={Math.max(at, first)}
                  style={{ ['--pct' as string]: `${pct}%` }}
                  aria-valuetext={`${pct} percent${current ? `, ${current.title}` : ''}`}
                  onChange={(e) => driver.seek(Number(e.target.value), driver.playing)} />
                <span className="mono replay-pct" aria-hidden>{pct}%</span>
              </label>
            </div>
          </section>

          <nav className="replay-chapters" aria-labelledby="replay-ch-h">
            <h2 id="replay-ch-h" className="replay-ch-h">Jump to</h2>
            {chapters.length ? (
              <ol>
                {chapters.map((c) => {
                  const seg = segOf.get(c.seq) ?? 0;
                  const now = current?.seq === c.seq;
                  return (
                    <li key={c.seq}>
                      <button type="button" className={`replay-ch replay-ch-${c.kind}`} aria-current={now ? 'step' : undefined}
                        aria-label={`Jump to: ${c.title}`} onClick={() => jump(c)}
                        style={{ ['--hue' as string]: sectionHue(seg), ['--on-hue' as string]: sectionInk(seg) }}>
                        {c.kind === 'segment'
                          ? <span className="replay-ch-tab mono" aria-hidden>{seg + 1}</span>
                          : <span className="replay-ch-q" aria-hidden><MessageCircleQuestion size={14} strokeWidth={2} /></span>}
                        <span className="replay-ch-text">
                          <span className="replay-ch-kind">{c.kind === 'segment' ? `Part ${seg + 1}` : 'Class question'}</span>
                          <span className="replay-ch-title">{c.title}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="replay-empty">No chapters: this class has no parts or class questions on record.</p>}
          </nav>
        </div>
      </article>
    </div>
  );
}

/** The chapter being played: the last one at or before the played seq. */
function chapterAt(chapters: ReplayChapter[], seq: number, started: boolean): ReplayChapter | null {
  if (!started && seq === 0) return null;
  let cur: ReplayChapter | null = null;
  for (const c of chapters) if (c.seq <= seq) cur = c;
  return cur;
}

/** Segment number for every chapter (a question belongs to the part it was asked in). */
function segmentIndex(chapters: ReplayChapter[]): Map<number, number> {
  const m = new Map<number, number>();
  let seg = -1;
  for (const c of chapters) {
    if (c.kind === 'segment') seg++;
    m.set(c.seq, Math.max(0, seg));
  }
  return m;
}

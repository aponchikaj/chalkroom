// The hero: the real board replays the demo PDA lesson (./demoLesson) on a timer, with people as
// punched holes and two questions that merge into one grouped sticky. It runs its own silent
// Player (never mainPlayer) and never speaks: narration only advances the captions at reading
// pace. Playback, and the clock that drives it, stop while the hero is off screen or the tab is
// hidden. The board is framed on the part of the page this lesson draws on (see .ld-frame).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StreamEvent } from '@chalk/schema';
import { Board, usePlayer } from '../../board/Board';
import { Player } from '../../lib/player';
import { Punch } from '../../ui/Punch';
import { Stamp } from '../../ui/Stamp';
import { prefersReducedMotion } from '../../ui/motion';
import { DEMO_SEGMENT, demoClusterAnswer } from './demoLesson';

type Steps = StreamEvent<'board'>['data']['steps'];

const SEGMENT = DEMO_SEGMENT;
/** The figure (title, wallet, program, PDA) and the formula, with their narration. The closing
 *  sticky note and last line are left out so the Q&A arrives while the visitor still watches. */
const LESSON: Steps = SEGMENT.steps.slice(0, Math.max(1, SEGMENT.steps.findIndex((s) => 'highlight' in s)));
/** The title is on the board from the first paint; the rest is drawn live. */
const TITLE: Steps = LESSON.slice(0, 1);
const DRAWN: Steps = LESSON.slice(1);
const LAST_SAY = [...LESSON].reverse().map((s) => ('say' in s ? s.say : '')).find(Boolean) ?? '';
const CLUSTER = 'Why can a PDA not sign?';
const ASKS = [
  { who: 'Gio', text: 'Why can a PDA not sign transactions?' },
  { who: 'Mari', text: 'why cant a PDA sign for itself' },
] as const;
const ANSWER = 'No private key exists, so only the program that derived it can sign, through invoke_signed.';

const PEOPLE = [
  { name: 'Ana', color: '#f2d16b', host: true },
  { name: 'Nika', color: '#8fc7e8' },
  { name: 'Gio', color: '#a8dc9f' },
  { name: 'Mari', color: '#f4a6c8' },
] as const;

/**
 * 0 drawing, 1 Gio asks, 2 Mari asks, 3 grouped, 4 coming up next,
 * 5 the Q&A page draws, 6 answered, 7 the page turns before the next run.
 */
type Phase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const readingMs = (text: string) => Math.max(1200, (text.split(/\s+/).length / 3.2) * 1000);

/** A Player that can never make a sound on this page, whatever the voice preferences say. */
function silentPlayer(): Player {
  const p = new Player({ silent: true });
  const s = p.speaker;
  s.settings.textOnly = true;
  s.silenced = true;
  s.speak = (text: string) => new Promise<void>((r) => setTimeout(r, readingMs(text)));
  s.prefetch = () => {};
  // never cancel speech that belongs to anything else
  s.stop = () => {};
  return p;
}

const board = (seq: number, steps: Steps) =>
  ({ seq, kind: 'board', data: { steps } }) as Pick<StreamEvent, 'seq' | 'kind' | 'data'>;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface Wait { left: number; until?: () => boolean; resolve: () => void; reject: (e: Error) => void }

export function HeroClass() {
  const player = useMemo(silentPlayer, []);
  usePlayer(player);
  const [phase, setPhase] = useState<Phase>(0);
  const [secs, setSecs] = useState(0);
  const [still, setStill] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // the caption holds its last line between sentences instead of going blank
  const lastCaption = useRef('');
  if (player.caption) lastCaption.current = player.caption;

  useEffect(() => {
    const el = rootRef.current;
    let inView = true;
    let live = document.visibilityState === 'visible';
    let stopped = false;
    let elapsed = 0;
    let timer = 0;
    let last = 0;
    const waits = new Set<Wait>();

    // one clock for every wait; it only ticks while the hero is on screen and the tab is in front
    const tick = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      elapsed += dt;
      const s = Math.floor(elapsed / 1000);
      setSecs((x) => (x === s ? x : s));
      for (const w of [...waits]) {
        w.left -= dt;
        if (w.left <= 0 && (!w.until || w.until())) { waits.delete(w); w.resolve(); }
      }
    };
    const startClock = () => {
      if (timer || stopped || !live || !waits.size) return;
      last = performance.now();
      timer = window.setInterval(tick, 100);
    };
    const stopClock = () => { if (timer) { clearInterval(timer); timer = 0; } };
    const wait = (ms: number, until?: () => boolean) => new Promise<void>((resolve, reject) => {
      waits.add({ left: ms, until, resolve, reject });
      startClock();
    });

    const update = () => {
      live = inView && document.visibilityState === 'visible';
      if (live) { player.resume(); startClock(); } else { player.pause(); stopClock(); }
    };
    const io = typeof IntersectionObserver === 'undefined' ? null
      : new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); }, { threshold: 0.05 });
    if (el && io) io.observe(el);
    document.addEventListener('visibilitychange', update);
    const cleanup = () => {
      stopped = true;
      stopClock();
      for (const w of waits) w.reject(new Error('stopped'));
      waits.clear();
      io?.disconnect();
      document.removeEventListener('visibilitychange', update);
      player.reset();
    };

    // reduced motion: the finished figure, its last line and the grouped question, no replay
    if (prefersReducedMotion()) {
      player.push(board(1, LESSON), false);
      lastCaption.current = LAST_SAY;
      setPhase(3);
      setSecs(30);
      setStill(true);
      return cleanup;
    }

    const idle = () => !player.busy;
    // the title is drawn at once so the first paint is never an empty frame
    player.push(board(1, TITLE), false);
    // the replay itself waits for an idle moment so it never competes with the page's first load
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const firstIdle = new Promise<void>((r) => { if (ric) ric(() => r(), { timeout: 1200 }); else setTimeout(r, 300); });
    void (async () => {
      try {
        await firstIdle;
        if (stopped) return;
        for (let seq = 1; ; seq += 3) {
          elapsed = 0;
          setSecs(0);
          if (seq > 1) {
            player.reset();
            player.push(board(seq, TITLE), false);
          }
          lastCaption.current = '';
          setPhase(0);
          player.push(board(seq + 1, DRAWN), true);
          await wait(3200); setPhase(1);
          await wait(1800); setPhase(2);
          await wait(1800); setPhase(3);
          await wait(4400); setPhase(4);
          // the lesson stops for the class question at about 13.5 s (the formula is drawn by then)
          await wait(2400);
          if (player.busy) player.interrupt();
          setPhase(5);
          player.push(board(seq + 2, demoClusterAnswer(CLUSTER, ['Gio', 'Mari'])), true);
          // answered once the answer box is on the board (about 18 s)
          await wait(5600); setPhase(6);
          await wait(1500, idle);
          await wait(3800); setPhase(7);
          await wait(650);
        }
      } catch { /* unmounted */ }
    })();
    return cleanup;
  }, [player]);

  const status = phase <= 2 ? null
    : phase === 3 ? <Stamp tone="section">Grouped, 2 asked</Stamp>
    : phase <= 5 ? <Stamp tone="ink">Coming up next</Stamp>
    : <Stamp tone="ok">Answered</Stamp>;
  const qa = phase >= 5;
  const caption = player.caption || lastCaption.current;

  return (
    <div ref={rootRef} className={`ld-stage ph-${phase}${still ? ' still' : ''}`}
      role="group" aria-label="A class in progress: the tutor draws a diagram about Solana program derived addresses, and two questions are grouped into one.">
      <div className="ld-punches" role="img" aria-label="4 of 5 seats taken: Ana, the host, Nika, Gio and Mari. One seat is open.">
        {PEOPLE.map((p) => <Punch key={p.name} name={p.name} color={p.color} host={'host' in p && p.host} />)}
        <span className="ld-seat-open" />
        <span className="ld-seats mono">4/5</span>
      </div>

      <p className="ld-hand ld-hand-drawn" aria-hidden>
        drawn live, one stroke at a time
        <svg width="70" height="46" viewBox="0 0 70 46"><path d="M64 4 C 48 28, 28 38, 6 40 M16 32 L5 40 L17 45" /></svg>
      </p>

      <div className="ld-boardhead" aria-hidden>
        <span className="ld-segtab">{qa ? 'Q&A' : `1 ${SEGMENT.title}`}</span>
        <span className="mono ld-segtime">{clock(secs)}</span>
        <span className="stamp stamp-section ld-live">{qa ? 'Answering' : 'Teaching'}</span>
      </div>

      <div className="ld-board" aria-hidden>
        <div className="ld-frame">
          <Board player={player} id="landing-board" follow={false} />
        </div>
        {/* the questions dock on the board's lower edge, as stickies do in a real class */}
        <div className="ld-asks">
          {phase >= 2 && (
            <div className="ld-sticky ld-sticky-under">
              <span className="ld-tape" />
              <div className="ld-sticky-head"><Stamp tone="pending">Sorting</Stamp></div>
              <p className="ld-sticky-q">{ASKS[1].text}</p>
              <p className="ld-sticky-who">{ASKS[1].who} asked</p>
            </div>
          )}
          {phase >= 1 && (
            <div className="ld-sticky ld-sticky-top">
              <span className="ld-tape" />
              <div className="ld-sticky-head">
                {status ?? <Stamp tone="pending">Sorting</Stamp>}
                {phase >= 3 && <span className="ld-plus">+1</span>}
              </div>
              <p className="ld-sticky-q">{phase >= 3 ? CLUSTER : ASKS[0].text}</p>
              <p className="ld-sticky-who">{phase >= 3 ? 'Gio and Mari asked' : 'Gio asked'}</p>
              {phase >= 6 && <p className="ld-sticky-answer">{ANSWER}</p>}
            </div>
          )}
        </div>
      </div>
      <p className="ld-caption" aria-hidden>
        <span className="ld-caption-who">Tutor</span>
        <span className="ld-caption-text">{caption || ' '}</span>
      </p>

      <div className="ld-qrow" aria-hidden>
        <p className="ld-hand ld-hand-group">two ways of asking,<br />one answer for both</p>
      </div>
    </div>
  );
}

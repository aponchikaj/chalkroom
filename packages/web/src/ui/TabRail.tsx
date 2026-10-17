// The lesson as divider tabs down the fore edge: one tab per segment, height proportional to
// its running time (measured for finished segments, estimated for the rest), the current tab
// extended and carrying the section hue. Horizontal on narrow screens.
import { useEffect, useState } from 'react';
import type { StreamEvent } from '@chalk/schema';
import { useRoom } from '../room/store';
import { sectionHue, sectionInk } from './section';

const EST_MS = 3 * 60_000; // design: segments run 2 to 4 minutes

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function TabRail({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const room = useRoom((s) => s.room)!;
  const events = useRoom((s) => s.mainEvents);
  const [now, setNow] = useState(() => Date.now());
  const live = room.phase !== 'lobby' && room.phase !== 'ended';
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  const plan = room.lesson_plan;
  if (!plan) {
    return (
      <nav className={`tabrail tabrail-${orientation}`} aria-label="Lesson">
        <span className="tabrail-empty">Lesson plan appears when the class starts</span>
      </nav>
    );
  }

  const starts = new Map<number, number>();
  for (const e of events) if (e.kind === 'segment_start') starts.set((e as StreamEvent<'segment_start'>).data.segment, Date.parse(e.t));
  const ends = new Map<number, number>();
  for (const e of events) if (e.kind === 'segment_end') ends.set((e as StreamEvent<'segment_end'>).data.segment, Date.parse(e.t));
  const durations = plan.segments.map((_, i) => {
    const a = starts.get(i);
    if (a === undefined || Number.isNaN(a)) return { ms: EST_MS, measured: false };
    const b = ends.get(i) ?? (i === room.segment && live ? now : undefined);
    return b === undefined ? { ms: EST_MS, measured: false } : { ms: Math.max(30_000, b - a), measured: true };
  });
  // tab size: real running time, but never smaller than an estimated segment, so the current
  // tab is always tall enough to read
  const size = (i: number) => Math.max(durations[i].ms, EST_MS);
  const total = plan.segments.reduce((n, _, i) => n + size(i), 0) || 1;

  return (
    <nav className={`tabrail tabrail-${orientation}`} aria-label="Lesson">
      <ol>
        {plan.segments.map((s, i) => {
          const state = room.phase === 'ended' || i < room.segment ? 'done' : i === room.segment && room.phase !== 'lobby' ? 'now' : 'todo';
          const d = durations[i];
          return (
            <li key={i} className={`tab tab-${state}`} style={{ ['--hue' as string]: sectionHue(i), ['--on-hue' as string]: sectionInk(i), flexGrow: size(i) / total * 100 }}
              aria-current={state === 'now' ? 'step' : undefined} title={s.objective}>
              <span className="tab-title">{s.title}</span>
              <span className="tab-time mono">{d.measured ? fmt(d.ms) : `~${Math.round(EST_MS / 60_000)}m`}</span>
              <span className="sr-only">{state === 'done' ? 'done' : state === 'now' ? 'now teaching' : 'up next'}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

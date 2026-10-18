// A1 (Dev A): the question rail. One sticky note per cluster (or lone question) with a status
// stamp, cards that need me first, then newest. A group is a stack. Recent system notices sit
// above the stickies. Questions this device is still sending show as pending stickies on top.
// Motion: a new sticky lands (.note-in); when triage regroups the board of stickies, the
// change runs as a view transition so each note slides to its new place.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Info, Pin, TriangleAlert } from 'lucide-react';
import type { StreamEvent } from '@chalk/schema';
import { useRoom } from '../../room/store';
import { transition } from '../../ui/motion';
import { Stamp } from '../../ui/Stamp';
import { usePendingAsks } from '../ask/pending';
import { buildCards, type RailCard } from './railModel';
import { QuestionCard } from './QuestionCard';
import './rail.css';

/** A steady tilt of up to 1 degree either way, from the card key. */
export function tiltFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 21) - 10) / 10;
}
const vtName = (key: string) => `qn-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
const shape = (cards: RailCard[]) => cards.map((c) => `${c.key}:${c.questions.length}`).join('|');

/** UX rule 2: a question still pending after this long says so */
const STALE_MS = 5_000;

export function QuestionRail() {
  const me = useRoom((s) => s.me);
  const questions = useRoom((s) => s.questions);
  const clusters = useRoom((s) => s.clusters);
  const threads = useRoom((s) => s.threads);
  const answers = useRoom(useShallow((s) => s.mainEvents.filter((e) => e.kind === 'answer_cluster')));
  const notices = useRoom(useShallow((s) => s.mainEvents.filter((e) => e.kind === 'notice').slice(-3)));

  const cards = useMemo(() => buildCards({ me, questions, clusters, threads, answers }), [me, questions, clusters, threads, answers]);
  const pendingAsks = usePendingAsks((s) => s.asks);

  // what is on screen: content changes apply at once; a regroup (cards joining, splitting,
  // reordering) runs inside a view transition so the stickies move instead of jumping
  const [shown, setShown] = useState(cards);
  const shownShape = useRef(shape(cards));
  // the transition callback runs later: it applies the newest cards, not the ones that started it
  const latest = useRef(cards);
  latest.current = cards;
  useLayoutEffect(() => {
    const next = shape(cards);
    if (next === shownShape.current) { setShown(cards); return; }
    const regroup = cards.length > 0 && shown.length > 0;
    shownShape.current = next;
    if (regroup) void transition(() => setShown(latest.current));
    else setShown(cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  // stickies that land after the rail first showed get the arrival motion
  const known = useRef<Set<string> | null>(null);
  if (!known.current) known.current = new Set(cards.map((c) => c.key));
  const arriving = new Set<string>();
  // my own question already landed as a pending sticky: it does not land twice
  for (const c of shown) if (!known.current.has(c.key) && !c.mine) arriving.add(c.key);
  useEffect(() => { for (const c of shown) known.current!.add(c.key); }, [shown]);

  // when this device first saw each pending question; trust created_at only for old rows
  // (after a rejoin), since a few seconds of clock skew would otherwise misreport
  const seen = useRef(new Map<string, number>());
  const [now, setNow] = useState(() => Date.now());
  const pending = Object.values(questions).filter((q) => q.status === 'pending');
  for (const q of pending) {
    if (seen.current.has(q.id)) continue;
    const created = Date.parse(q.created_at);
    seen.current.set(q.id, Date.now() - created > 30_000 ? created : Date.now());
  }
  const waiting = pending.some((q) => now - (seen.current.get(q.id) ?? now) < STALE_MS);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  const isStale = (ids: string[]) => ids.some((id) => questions[id]?.status === 'pending' && now - (seen.current.get(id) ?? now) >= STALE_MS);

  return (
    <div className="qrail">
      {notices.length > 0 && (
        <ul className="qrail-notices" aria-label="Class notices">
          {notices.map((n) => {
            const d = (n as StreamEvent<'notice'>).data;
            return (
              <li key={n.seq} className={`qrail-notice ${d.level === 'warn' ? 'warn' : ''}`}>
                {d.level === 'warn' ? <TriangleAlert size={14} strokeWidth={2.25} aria-hidden /> : <Info size={14} strokeWidth={2.25} aria-hidden />}
                <span>{d.text}</span>
              </li>
            );
          })}
        </ul>
      )}

      {shown.length === 0 && !pendingAsks.length ? (
        <div className="qrail-empty">
          <p className="qrail-empty-head">No questions yet</p>
          <p>Ask anything, anytime. Similar questions are grouped so the class gets one answer.</p>
          <p className="faint">Type below, or select shapes on the board to ask about them.</p>
        </div>
      ) : (
        <ol className="qrail-list" aria-label="Questions">
          {pendingAsks.map((a) => (
            <li key={a.id} className="qnote" style={{ '--tilt': `${tiltFor(a.id)}deg` } as CSSProperties}>
              <article className="qcard pending mine note-in" aria-label={`Sending: ${a.text}`} aria-busy="true">
                <header className="qcard-head"><Stamp tone="pending">Sending</Stamp></header>
                <h3 className="qcard-title">{a.text}</h3>
                {a.shapes > 0 && <p className="qcard-meta"><Pin size={12} strokeWidth={2.5} aria-hidden />Pinned to <span className="mono">{a.shapes}</span> {a.shapes === 1 ? 'shape' : 'shapes'} on the board</p>}
                <p className="qcard-by">You asked, just now</p>
              </article>
            </li>
          ))}
          {shown.map((c) => {
            const stack = c.questions.length > 1 ? Math.min(2, c.questions.length - 1) : 0;
            return (
              <li key={c.key} className={`qnote${stack ? ` stacked stack-${stack}` : ''}`}
                style={{ '--tilt': `${tiltFor(c.key)}deg`, viewTransitionName: vtName(c.key) } as CSSProperties}>
                <QuestionCard card={c} stale={isStale(c.questions.map((q) => q.id))} arriving={arriving.has(c.key)} />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

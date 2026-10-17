// W2: my own study of this class's deck. Due cards one at a time (front, Show answer, then
// Again / Hard / Good / Easy; Space and 1 to 4 on the keyboard). The API schedules each card
// (FSRS) and returns my new review row; a failed review keeps the card on the page.
import { useEffect, useMemo, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { CardReviewRow, CardRow } from '@chalk/schema';
import { Markdown } from '../../components/Markdown';
import { api } from '../../lib/api';
import { dueCards } from '../../lib/library';
import { Stamp } from '../../ui/Stamp';
import { count, dueWords } from './words';

type Rating = 'again' | 'hard' | 'good' | 'easy';
const RATINGS: { r: Rating; label: string }[] = [
  { r: 'again', label: 'Again' }, { r: 'hard', label: 'Hard' }, { r: 'good', label: 'Good' }, { r: 'easy', label: 'Easy' },
];
const ICON = { size: 16, strokeWidth: 2 } as const;

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function Flashcards({ cards, reviews, onReviewed }: {
  cards: CardRow[]; reviews: Record<string, CardReviewRow>; onReviewed: (row: CardReviewRow) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const due = useMemo(() => dueCards({ cards, reviews }, new Date(now)), [cards, reviews, now]);
  const [done, setDone] = useState(0);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState<Rating | null>(null);
  const [error, setError] = useState('');
  const card = due[0];
  const goodRef = useRef<HTMLButtonElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const active = cards.filter((c) => c.status === 'active');

  // a card marked Again comes back within minutes; look again once a minute
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { setShown(false); setError(''); }, [card?.id]);
  // after a rating, keep the keyboard on the study leaf (not on first open: the tabs keep focus)
  useEffect(() => { if (done > 0 && !shown) showRef.current?.focus(); }, [done, shown]);
  useEffect(() => { if (shown) goodRef.current?.focus(); }, [shown]);

  const rate = (r: Rating) => {
    if (!card || busy) return;
    setBusy(r); setError('');
    api.reviewCard(card.id, { rating: r })
      .then((row) => { setDone((d) => d + 1); onReviewed(row); setNow(Date.now()); })
      .catch((e: Error) => setError(`${e.message || 'The review did not save.'} The card stays here; rate it again in a moment.`))
      .finally(() => setBusy(null));
  };

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (!card || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    // Space reveals unless another control has focus (a selected section tab counts as no control)
    const free = !(e.target instanceof HTMLElement) || !e.target.closest('button, a') || e.target.getAttribute('role') === 'tab';
    if (!shown && e.key === ' ' && free) { e.preventDefault(); setShown(true); return; }
    const k = Number(e.key);
    if (shown && k >= 1 && k <= 4) { e.preventDefault(); rate(RATINGS[k - 1].r); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (cards.length === 0) {
    return (
      <>
        <div className="shelf-sec-head"><h2>Flashcards</h2></div>
        <p className="shelf-empty">Cards arrive when the class ends: the scribe turns the lesson into a deck.</p>
      </>
    );
  }

  const next = active.map((c) => reviews[c.id]?.fsrs.due).filter((d): d is string => !!d).sort()[0];

  return (
    <>
      <div className="shelf-sec-head">
        <h2>Flashcards</h2>
        <p className="shelf-sec-sub">Your own schedule. {count(due.length, 'card')} due now{done > 0 && <>, {count(done, 'review')} this sitting</>}.</p>
      </div>

      <section className="flash-study" aria-label="Study">
        {card ? (
          <>
            <div className="flash-meta">
              <span>Card <span className="mono">{done + 1}</span> of <span className="mono">{done + due.length}</span></span>
              {reviews[card.id] ? <Stamp tone="ink">Review</Stamp> : <Stamp tone="pending">New</Stamp>}
            </div>
            <div className="flash-face">
              <span className="flash-side">Front</span>
              <Markdown className="flash-text" text={card.front} />
            </div>
            {shown ? (
              <>
                <div className="flash-face flash-back" aria-live="polite">
                  <span className="flash-side">Back</span>
                  <Markdown className="flash-text" text={card.back} />
                </div>
                {error && <p className="errata" role="alert"><TriangleAlert {...ICON} aria-hidden />{error}</p>}
                <div className="flash-rate" role="group" aria-label="How well did you know it?">
                  {RATINGS.map(({ r, label }, k) => (
                    <button key={r} ref={r === 'good' ? goodRef : undefined} type="button"
                      className={`btn btn-lg ${r === 'good' ? 'primary' : ''}`} disabled={busy !== null}
                      aria-keyshortcuts={String(k + 1)} onClick={() => rate(r)}>
                      {busy === r ? 'Saving' : label}<span className="kbd" aria-hidden>{k + 1}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flash-actions">
                <button type="button" className="btn primary btn-lg" onClick={() => setShown(true)} aria-keyshortcuts="Space" ref={showRef}>
                  Show answer<span className="kbd" aria-hidden>Space</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flash-done" role="status">
            <h3>All caught up.</h3>
            <p className="shelf-sec-sub">
              {active.length === 0 ? 'None of these cards are in your study deck yet.'
                : next ? <>Next card due {dueWords(next, now)}.</> : 'Nothing is scheduled.'}
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="flash-all">
        <div className="shelf-sub-head"><h3 id="flash-all">All cards</h3><span className="faint">{count(cards.length, 'card')}</span></div>
        <ol className="flash-list">
          {cards.map((c) => {
            const rv = reviews[c.id];
            return (
              <li key={c.id} className="flash-row">
                <Markdown className="flash-row-front" text={c.front} />
                <Markdown className="flash-row-back" text={c.back} />
                <span className="flash-row-due">
                  {c.status !== 'active' ? <Stamp tone="muted">{c.status === 'proposed' ? 'Proposed' : 'Suspended'}</Stamp>
                    : !rv ? <Stamp tone="pending">New</Stamp>
                      : Date.parse(rv.fsrs.due) <= now ? <Stamp tone="section">Due now</Stamp>
                        : <span className="muted">Due {dueWords(rv.fsrs.due, now)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

// A1 (Dev A): the question rail. One card per cluster (or lone question) with a status stamp,
// cards that need me first, then newest. Recent system notices sit above the cards.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Info, TriangleAlert } from 'lucide-react';
import type { StreamEvent } from '@chalk/schema';
import { useRoom } from '../../room/store';
import { buildCards } from './railModel';
import { QuestionCard } from './QuestionCard';
import './rail.css';

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

      {cards.length === 0 ? (
        <div className="qrail-empty">
          <p className="qrail-empty-head">No questions yet</p>
          <p>Ask anything, anytime. Similar questions are grouped so the class gets one answer.</p>
          <p className="faint">Type below, hold Space to talk, or select shapes on the board to ask about them.</p>
        </div>
      ) : (
        <ol className="qrail-list" aria-label="Questions">
          {cards.map((c) => (
            <li key={c.key}><QuestionCard card={c} stale={isStale(c.questions.map((q) => q.id))} /></li>
          ))}
        </ol>
      )}
    </div>
  );
}

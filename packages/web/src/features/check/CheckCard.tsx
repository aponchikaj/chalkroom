// A4 (Dev A) + lane C: the end-of-segment check, a worksheet slip docked under the board and its
// captions. Shows once narration finishes; sending an answer also marks me ready; my choice stays
// marked. After the gate the class sees a green rubber stamp ("Correct, 3 of 4"), the spread, the
// answer and why; the host also sees who answered. The result folds to a chip when the board
// moves on (or on dismiss). While a catch-up card is up, the check waits folded (classroom.css).
import { useEffect, useId, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { PublicQuestion, Question } from '@chalk/schema';
import { mainPlayer, selectReadyIds, useRoom } from '../../room/store';
import { usePlayer } from '../../board/Board';
import { api } from '../../lib/api';
import { QuestionInput } from '../../components/QuestionInput';
import { Markdown } from '../../components/Markdown';
import { Stamp } from '../../ui/Stamp';
import { Spread } from './Spread';
import { WhoAnswered } from './WhoAnswered';
import { FREE_TEXT, myAnswer, rememberAnswer, spreadRows } from './checkData';
import './check.css';

export function CheckCard() {
  usePlayer(mainPlayer);
  const room = useRoom((s) => s.room)!;
  const check = useRoom((s) => s.check);
  const answered = useRoom((s) => s.answered);
  const closed = useRoom((s) => s.closedChecks);
  const mainEvents = useRoom((s) => s.mainEvents);
  const [value, setValue] = useState<unknown>(undefined);
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const promptId = useId();

  // the most recent check this device saw, open or closed
  const lastIdx = mainEvents.findLastIndex((e) => e.kind === 'check');
  const last = lastIdx >= 0 ? mainEvents[lastIdx] : null;
  const lastId = last ? (last.data as { checkId: string }).checkId : null;
  useEffect(() => { setValue(undefined); setError(''); }, [lastId]);

  if (!last || !lastId || room.phase === 'ended' || room.phase === 'lobby') return null;
  const result = closed[lastId];
  const open = check?.checkId === lastId;
  if (!open && !result) return null;
  // let the explanation before it finish playing on this device
  if (open && mainPlayer.busy) return null;

  const { segment, question: pub } = last.data as { segment: number; question: PublicQuestion };
  const free = FREE_TEXT.has(pub.type);
  const mine = !!answered[lastId];
  const local = myAnswer(lastId);
  const n = segment + 1;

  if (result) {
    // fold once the board moves on after the result (Q&A answer, next segment), or on dismiss
    const closedAt = mainEvents.findLastIndex((e) => e.kind === 'check_closed' && (e.data as { checkId: string }).checkId === lastId);
    const movedOn = mainEvents.slice(closedAt + 1).some((e) => e.kind === 'answer_cluster' || e.kind === 'segment_start' || e.kind === 'board');
    const folded = fold[lastId] ?? (movedOn || room.phase === 'teaching');
    const { correct, total } = result.spread;
    const nobody = total === 0;
    const tally = nobody ? 'Nobody answered' : free ? `${total} answered` : `${correct} of ${total} got it`;
    const tallyEl = nobody ? <span className="check-tally">Nobody answered</span>
      : free ? <span className="check-tally"><span className="mono">{total}</span> answered</span>
      : <span className="check-tally"><span className="mono">{correct}</span> of <span className="mono">{total}</span> got it</span>;
    if (folded) {
      return (
        <button type="button" className="check-chip acetate step-in" onClick={() => setFold({ ...fold, [lastId]: false })}
          aria-expanded="false" aria-label={`Show check ${n} result: ${tally}`}>
          <span className="check-chip-name">Check {n}</span>
          {tallyEl}
          <ChevronUp size={16} strokeWidth={2} aria-hidden />
        </button>
      );
    }
    return (
      <section className="check-card worksheet hinge-in" aria-label={`Check ${n} result`}>
        <header className="check-head">
          <h2>Check {n} result</h2>
          {nobody || free ? <span className="rubber-stamp is-quiet stamp-in" role="status">{nobody ? 'Nobody answered' : `${total} answered`}</span>
            : <span className="rubber-stamp stamp-in" role="status" aria-label={`${correct} of ${total} got it right`}>Correct, <span className="mono">{correct}</span> of <span className="mono">{total}</span></span>}
          <span className="spacer" />
          <button type="button" className="btn ghost small" onClick={() => setFold({ ...fold, [lastId]: true })} aria-expanded="true">
            <ChevronDown size={16} strokeWidth={2} aria-hidden />Fold away
          </button>
        </header>
        <div className="check-body">
          <div className="check-col">
            <div className="check-prompt"><Markdown text={pub.prompt} /></div>
            {nobody ? <p className="check-note">Nobody sent an answer this time. The answer and why are beside this.</p>
              : free ? <p className="check-note">The tutor reads these. Look for your answer in the Q&amp;A.</p>
              : <Spread rows={spreadRows(pub, result, local)} total={total} />}
            {!free && mine && local === undefined && <p className="check-note">You answered on another device.</p>}
            <WhoAnswered checkId={lastId} closed />
          </div>
          <div className="check-col check-why">
            <p className="check-answer">{result.answerText ? `Answer: ${result.answerText}` : 'The tutor explains it in the Q&A.'}</p>
            {result.explanation && <Markdown className="check-expl" text={result.explanation} />}
          </div>
        </div>
      </section>
    );
  }

  const q = pub as Question;
  const empty = value === undefined || value === '' || (Array.isArray(value) && !value.length);
  const submit = () => {
    setSending(true);
    api.answerCheck(room.id, lastId, { answer: value })
      .then(() => {
        rememberAnswer(lastId, value); setError('');
        useRoom.setState((s) => ({ answered: { ...s.answered, [lastId]: true } }));
        // answering is being ready: one action, not two (unless already ready or in a thread)
        const s = useRoom.getState();
        if (s.room?.phase === 'check' && s.me && !selectReadyIds(s).has(s.me) && !s.presence[s.me]?.threadId) {
          void api.ready(room.id, { segment: s.room.segment }).catch(() => setError("Your answer was sent, but Ready was not. Press I'm ready."));
        }
      })
      .catch((e) => setError(`${(e as Error).message || 'Your answer did not send.'} Try Submit again.`))
      .finally(() => setSending(false));
  };

  return (
    <section className="check-card worksheet hinge-in" aria-label={`Check ${n}`}>
      <header className="check-head">
        <h2>Check {n}</h2>
        {mine ? <Stamp tone="ok">Answer sent</Stamp> : <Stamp tone="pending">Open</Stamp>}
        <span className="check-folded-note">Waiting while you catch up</span>
      </header>
      <div className="check-prompt" id={promptId}><Markdown text={pub.prompt} /></div>
      <div className="check-inputs">
        {mine && local !== undefined && CHOICE.has(q.type) ? <SentChoice q={q} value={local} />
          : <QuestionInput q={q} value={mine ? (local ?? value) : value} onChange={setValue} disabled={mine || sending} labelledBy={promptId} />}
      </div>
      {error && <p className="errata" role="alert">{error}</p>}
      <footer className="check-foot">
        {mine ? (
          <p className="check-note">{free ? 'Answer sent, and you are marked ready. The tutor reads these.' : 'Answer sent, and you are marked ready. The class sees the spread when everyone is.'}</p>
        ) : (
          <>
            <p className="check-note">{free ? 'The tutor reads these. Submitting also marks you ready.' : 'Everyone answers, then the class sees the spread. Submitting also marks you ready.'}</p>
            <button type="button" className="btn primary" disabled={empty || sending} onClick={submit}>{sending ? 'Sending' : 'Submit'}</button>
          </>
        )}
      </footer>
      <WhoAnswered checkId={lastId} closed={false} />
    </section>
  );
}

const CHOICE = new Set(['mcq', 'multi', 'tf']);
const LETTERS = 'ABCDEFGHIJ';

/** The options as sent: mine in ink with a tick and "Your answer", the rest dashed. */
function SentChoice({ q, value }: { q: Question; value: unknown }) {
  const tf = q.type === 'tf';
  const picked = tf
    ? (b: number) => (typeof value === 'object' && value ? (value as { value?: boolean }).value : value) === (b === 0)
    : (i: number) => (Array.isArray(value) ? value.includes(i) : value === i);
  const opts = tf ? ['True', 'False'] : q.options ?? [];
  return (
    <ul className="sent-options" aria-label="Your answer">
      {opts.map((o, i) => (
        <li key={i} className={`sent-option${picked(i) ? ' is-mine' : ''}`}>
          {!tf && <span className="key">{LETTERS[i]}</span>}
          <span className="grow"><Markdown text={o} /></span>
          {picked(i) && <span className="sent-mark"><Check size={16} strokeWidth={2.5} aria-hidden />Your answer</span>}
        </li>
      ))}
    </ul>
  );
}

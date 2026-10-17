// A4 (Dev A): the end-of-segment check, an acetate leaf over the lower board. Shows once narration
// finishes; after the gate the class sees the spread, the answer and why. The result folds to a
// chip when the board moves on (or on dismiss) so the figure stays in view.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { PublicQuestion, Question } from '@chalk/schema';
import { mainPlayer, useRoom } from '../../room/store';
import { usePlayer } from '../../board/Board';
import { api } from '../../lib/api';
import { QuestionInput } from '../../components/QuestionInput';
import { Markdown } from '../../components/Markdown';
import { Stamp } from '../../ui/Stamp';
import { Spread } from './Spread';
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
    const tally = free ? `${total} answered` : `${correct} of ${total} got it`;
    const tallyEl = free ? <span className="check-tally"><span className="mono">{total}</span> answered</span>
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
      <section className="check-card acetate hinge-in" aria-label={`Check ${n} result`}>
        <header className="check-head">
          <h3>Check {n} result</h3>
          {tallyEl}
          <span className="spacer" />
          <button type="button" className="btn ghost small" onClick={() => setFold({ ...fold, [lastId]: true })} aria-expanded="true">
            <ChevronDown size={16} strokeWidth={2} aria-hidden />Fold away
          </button>
        </header>
        <div className="check-body">
          <div className="check-col">
            <div className="check-prompt"><Markdown text={pub.prompt} /></div>
            {free ? <p className="check-note">The tutor reads these. Look for your answer in the Q&amp;A.</p>
              : <Spread rows={spreadRows(pub, result, local)} total={total} />}
            {!free && mine && local === undefined && <p className="check-note">You answered on another device.</p>}
          </div>
          <div className="check-col check-why">
            <p className="check-answer"><span className="check-answer-label">Answer</span> {result.answerText || 'The tutor explains it in the Q&A.'}</p>
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
      .then(() => { rememberAnswer(lastId, value); setError(''); useRoom.setState((s) => ({ answered: { ...s.answered, [lastId]: true } })); })
      .catch((e) => setError(`${(e as Error).message || 'Your answer did not send.'} Try Submit again.`))
      .finally(() => setSending(false));
  };

  return (
    <section className="check-card acetate hinge-in" aria-label={`Check ${n}`}>
      <header className="check-head">
        <h3>Check {n}</h3>
        {mine ? <Stamp tone="ok">Answer sent</Stamp> : <Stamp tone="pending">Open</Stamp>}
      </header>
      <div className="check-prompt"><Markdown text={pub.prompt} /></div>
      <div className="check-inputs">
        <QuestionInput q={q} value={mine ? (local ?? value) : value} onChange={setValue} disabled={mine || sending} />
      </div>
      {error && <p className="errata" role="alert">{error}</p>}
      <footer className="check-foot">
        {mine ? (
          <p className="check-note">{free ? 'Answer sent. The tutor reads these.' : 'Answer sent. The class sees the spread when everyone is ready.'}</p>
        ) : (
          <>
            <p className="check-note">{free ? 'The tutor reads these.' : 'Everyone answers, then the class sees the spread.'}</p>
            <button type="button" className="btn primary" disabled={empty || sending} onClick={submit}>{sending ? 'Sending' : 'Submit'}</button>
          </>
        )}
      </footer>
    </section>
  );
}

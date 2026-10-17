// The end-of-segment check over the board. Shows once narration finishes; after the gate the
// class sees the answer spread ("3/4 got it") and the correct answer.
// TODO(frontend): richer spread (bar per option), "you" marker, collapse to a chip.
import { useEffect, useState } from 'react';
import type { Question } from '@chalk/schema';
import { mainPlayer, useRoom } from '../room/store';
import { usePlayer } from '../board/Board';
import { api } from '../lib/api';
import { QuestionInput } from './QuestionInput';
import { Markdown } from './Markdown';

export function CheckCard() {
  usePlayer(mainPlayer);
  const room = useRoom((s) => s.room)!;
  const check = useRoom((s) => s.check);
  const answered = useRoom((s) => s.answered);
  const closed = useRoom((s) => s.closedChecks);
  const mainEvents = useRoom((s) => s.mainEvents);
  const [value, setValue] = useState<unknown>(undefined);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [error, setError] = useState('');

  // the most recent check this device saw, open or closed
  const last = [...mainEvents].reverse().find((e) => e.kind === 'check');
  const lastId = last ? (last.data as { checkId: string }).checkId : null;
  useEffect(() => { setValue(undefined); setError(''); }, [lastId]);

  if (!last || !lastId || dismissed === lastId) return null;
  const result = closed[lastId];
  const open = check?.checkId === lastId;
  if (!open && !result) return null;
  // wait for the explanation before it to finish playing on this device
  if (open && mainPlayer.busy) return null;
  // once the next segment starts, get out of the way
  if (result && room.phase === 'teaching') return null;

  const pub = (last.data as { question: Omit<Question, 'answer'> }).question;
  const q = { ...pub, answer: result?.answer } as Question;
  const mine = !!answered[lastId];
  const empty = value === undefined || value === '' || (Array.isArray(value) && !value.length);

  const submit = () => api.answerCheck(room.id, lastId, { answer: value }).catch((e) => setError((e as Error).message));

  return (
    <div className="check-card" role="dialog" aria-label="Check question">
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="section-title" style={{ margin: 0 }}>{result ? 'Check result' : 'Quick check'}</span>
        <span className="spacer" />
        {result && <button className="btn ghost small" onClick={() => setDismissed(lastId)} aria-label="Dismiss">✕</button>}
      </div>
      <h3><Markdown text={q.prompt} /></h3>
      <QuestionInput q={q} value={value} onChange={setValue} reveal={!!result} disabled={mine || !!result} />
      {result ? (
        <div className="feedback" style={{ marginTop: 10 }}>
          <b>{result.spread.correct}/{result.spread.total} got it.</b> Answer: {result.answerText}
          {result.explanation && <Markdown text={result.explanation} />}
        </div>
      ) : (
        <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          {error && <span className="error-text">{error}</span>}
          {mine ? <span className="faint">Answer sent. The class sees the spread when everyone is ready.</span>
            : <button className="btn primary" disabled={empty} onClick={submit}>Submit</button>}
        </div>
      )}
    </div>
  );
}

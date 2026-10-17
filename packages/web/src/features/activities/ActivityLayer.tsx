// Lane M: a live activity over the class: the quiz duel and a teach-back.
// The duel is an acetate leaf laid over the whole board (on phones it takes the board's place):
// question, options, a countdown, answer once; then the spread and the running leaderboard; at
// the end the final leaderboard and what the tutor will re-teach. The teach-back is a leaf hinged
// over the right of the board, so the tutor's drawing of the missing piece stays visible.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Hand, Send, X } from 'lucide-react';
import type { PublicQuestion, Question } from '@chalk/schema';
import { useRoom } from '../../room/store';
import { api } from '../../lib/api';
import { Markdown } from '../../components/Markdown';
import { Stamp } from '../../ui/Stamp';
import { Spread } from '../check/Spread';
import { spreadRows, type SpreadRow } from '../check/checkData';
import type { ClosedCheck } from '../../room/store';
import { clock, currentActivity, deadlineOf, timeLeft, type DuelView, type TeachbackView } from './activityModel';
import './activities.css';

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
const LETTERS = 'ABCDEFGHIJ';

/** Re-render every `ms` while `on`; returns Date.now(). */
export function useNow(on: boolean, ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [on, ms]);
  return now;
}

export function ActivityLayer() {
  const events = useRoom((s) => s.mainEvents);
  const phase = useRoom((s) => s.room?.phase);
  const [dismissed, setDismissed] = useState<Record<string, true>>({});
  const live = useNow(true, 1000);
  const a = useMemo(() => currentActivity(events, live), [events, live]);
  if (!a || a.stale || a.movedOn || dismissed[a.id] || phase === 'lobby' || phase === 'ended') return null;
  const close = () => setDismissed((d) => ({ ...d, [a.id]: true }));
  return a.kind === 'duel' ? <DuelLeaf a={a} onClose={close} /> : <TeachbackLeaf a={a} onClose={close} />;
}

// ---------------------------------------------------------------------------
// Quiz duel
// ---------------------------------------------------------------------------

function DuelLeaf({ a, onClose }: { a: DuelView; onClose: () => void }) {
  const room = useRoom((s) => s.room)!;
  const me = useRoom((s) => s.me);
  const now = useNow(!!a.question);
  // what this device sent, per question index
  const [sent, setSent] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const q = a.question;
  const key = (i: number) => `${a.id}:${i}`;
  useEffect(() => { setDraft(''); setError(''); }, [q?.index]);

  const send = (answer: unknown) => {
    if (!q || sending || key(q.index) in sent) return;
    setSending(true);
    setSent((s) => ({ ...s, [key(q.index)]: answer }));
    api.duelAnswer(room.id, { duelId: a.id, index: q.index, answer })
      .then(() => setError(''))
      .catch((e) => {
        const msg = (e as Error).message || '';
        if (/already answered/.test(msg)) return; // sent from another device
        setSent((s) => { const n = { ...s }; delete n[key(q.index)]; return n; });
        setError(/closed|over/.test(msg) ? 'Time was up before your answer arrived.' : `Your answer did not send. ${msg}`.trim());
      })
      .finally(() => setSending(false));
  };

  const head = (title: string, extra?: ReactNode) => (
    <header className="act-head">
      <h3>{title}</h3>
      {extra}
      <span className="spacer" />
      {a.end && <button type="button" className="btn ghost small" onClick={onClose}><X {...ICON} />Close</button>}
    </header>
  );

  if (a.end) {
    const reteach = a.end.reteach;
    return (
      <div className="board-overlay act-overlay">
        <section className="act-leaf acetate hinge-in" aria-label="Quiz duel result">
          {head('Quiz duel over', <span className="act-count"><span className="mono">{a.results.filter(Boolean).length}</span> questions</span>)}
          <Leaders leaders={a.end.leaders} me={me} />
          <p className="act-reteach">{reteach ? <>The tutor will re-teach: <strong>{reteach}</strong></> : 'The class got every question. Nothing to re-teach.'}</p>
        </section>
      </div>
    );
  }

  if (q) {
    const pub = q.question as PublicQuestion;
    const left = Date.parse(q.endsAt) - now;
    const total = a.seconds * 1000;
    const mine = sent[key(q.index)];
    const answered = key(q.index) in sent;
    const over = left <= 0;
    return (
      <div className="board-overlay act-overlay">
        <section className="act-leaf acetate hinge-in" aria-label={`Quiz duel question ${q.index + 1} of ${a.count}`} key={q.index}>
          {head('Quiz duel', <span className="act-count">Question <span className="mono">{q.index + 1}</span> of <span className="mono">{a.count}</span></span>)}
          <div className="duel-clock" role="timer" aria-label={`${Math.max(0, Math.ceil(left / 1000))} seconds left`}>
            <span className="duel-secs mono">{Math.max(0, Math.ceil(left / 1000))}</span>
            <span className="duel-track" aria-hidden><span className="duel-fill" style={{ width: `${Math.max(0, Math.min(1, left / total)) * 100}%` }} /></span>
          </div>
          <div className="act-prompt"><Markdown text={pub.prompt} /></div>
          <DuelOptions q={pub as Question} mine={mine} answered={answered} disabled={answered || over || sending} onPick={send}
            draft={draft} setDraft={setDraft} />
          {error && <p className="errata" role="alert">{error}</p>}
          <p className="act-note" aria-live="polite">
            {answered ? <><Check {...ICON} />Answer locked in. The spread shows when time is up or everyone answered.</>
              : over ? 'Time is up.' : 'Faster right answers score more points. One answer each.'}
          </p>
        </section>
      </div>
    );
  }

  if (a.result) {
    const r = a.result;
    const asked = a.asked[r.index];
    const mine = sent[key(r.index)];
    const prev = r.index > 0 ? a.results[r.index - 1]?.leaders : undefined;
    const gained = me ? (r.leaders.find((l) => l.userId === me)?.points ?? 0) - (prev?.find((l) => l.userId === me)?.points ?? 0) : 0;
    const closed = { checkId: a.id, spread: r.spread, answer: r.answer, answerText: r.answerText } as ClosedCheck;
    const rows: SpreadRow[] = asked ? spreadRows(asked.question, closed, mine) : [];
    const last = r.index + 1 >= a.count;
    return (
      <div className="board-overlay act-overlay">
        <section className="act-leaf acetate hinge-in" aria-label={`Quiz duel question ${r.index + 1} result`}>
          {head('Quiz duel', <span className="act-count">Question <span className="mono">{r.index + 1}</span> of <span className="mono">{a.count}</span></span>)}
          <div className="duel-result">
            <div className="duel-col">
              {asked && <div className="act-prompt act-prompt-sm"><Markdown text={asked.question.prompt} /></div>}
              <Spread rows={rows} total={r.spread.total} />
              <p className="act-answer">Answer: {r.answerText}</p>
              {mine !== undefined && <p className="act-note">{gained > 0 ? <>You scored <span className="mono">+{gained}</span></> : 'No points this time.'}</p>}
            </div>
            <div className="duel-col duel-board">
              <Leaders leaders={r.leaders} me={me} />
              <p className="act-note">{last ? 'Final standings next.' : 'Next question in a moment.'}</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="board-overlay act-overlay">
      <section className="act-leaf acetate hinge-in" aria-label="Quiz duel">
        {head('Quiz duel', <Stamp tone="pending">Starting</Stamp>)}
        <p className="act-note"><span className="mono">{a.count}</span> questions, <span className="mono">{a.seconds}</span> seconds each. Faster right answers score more.</p>
      </section>
    </div>
  );
}

function DuelOptions({ q, mine, answered, disabled, onPick, draft, setDraft }: {
  q: Question; mine: unknown; answered: boolean; disabled: boolean; onPick: (v: unknown) => void; draft: string; setDraft: (s: string) => void;
}) {
  if (q.type === 'numeric' || q.type === 'blank') {
    return (
      <form className="duel-typed" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) onPick(draft.trim()); }}>
        <input className="input" inputMode={q.type === 'numeric' ? 'decimal' : 'text'} aria-label="Your answer" placeholder={q.type === 'numeric' ? 'Number' : 'Your answer'}
          value={answered ? String(mine ?? '') : draft} onChange={(e) => setDraft(e.target.value)} disabled={disabled} autoFocus />
        <button type="submit" className="btn primary" disabled={disabled || !draft.trim()}><Send {...ICON} />Send</button>
      </form>
    );
  }
  const opts = q.type === 'tf' ? ['True', 'False'] : q.options ?? [];
  const valueOf = (i: number) => (q.type === 'tf' ? i === 0 : i);
  return (
    <div className="duel-options" role="radiogroup" aria-label="Answers">
      {opts.map((o, i) => {
        const picked = answered && mine === valueOf(i);
        return (
          <button key={i} type="button" role="radio" aria-checked={picked} aria-pressed={picked}
            className={`option duel-option${answered && !picked ? ' is-off' : ''}`} disabled={disabled} onClick={() => onPick(valueOf(i))}>
            {q.type !== 'tf' && <span className="key">{LETTERS[i]}</span>}
            <span className="grow"><Markdown text={o} /></span>
            {picked && <span className="sent-mark"><Check size={16} strokeWidth={2.5} aria-hidden />Your answer</span>}
          </button>
        );
      })}
    </div>
  );
}

function Leaders({ leaders, me }: { leaders: { userId: string; name: string; points: number }[]; me: string | null }) {
  return (
    <ol className="leaders" aria-label="Leaderboard">
      {leaders.map((l, i) => (
        <li key={l.userId} className={`leader${l.userId === me ? ' is-me' : ''}`}>
          <span className="leader-rank mono">{i + 1}</span>
          <span className="leader-name">{l.name}</span>
          {l.userId === me && <Stamp tone="ink">You</Stamp>}
          <span className="leader-points mono">{l.points}</span>
        </li>
      ))}
      {!leaders.length && <li className="act-note">Nobody answered yet.</li>}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Teach-back
// ---------------------------------------------------------------------------

function TeachbackLeaf({ a, onClose }: { a: TeachbackView; onClose: () => void }) {
  const room = useRoom((s) => s.room)!;
  const me = useRoom((s) => s.me);
  const deadline = deadlineOf(a);
  const now = useNow(deadline !== null, 1000);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mineToWrite = a.volunteer?.userId === me && !a.explanation;

  const run = (p: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    p().then(() => setError('')).catch((e) => setError(`${fail} ${(e as Error).message || ''}`.trim())).finally(() => setBusy(false));
  };

  let body: ReactNode;
  if (!a.volunteer) {
    body = (
      <>
        <p className="act-note">{a.prompt}</p>
        <div className="act-foot">
          <span className="act-time"><span className="mono">{clock(timeLeft(a, now))}</span> to volunteer</span>
          <button type="button" className="btn primary" disabled={busy}
            onClick={() => run(() => api.teachbackVolunteer(room.id, { teachbackId: a.id }), 'That did not go through.')}>
            <Hand {...ICON} />{busy ? 'Sending' : "I'll explain"}
          </button>
        </div>
      </>
    );
  } else if (mineToWrite) {
    body = (
      <form className="tb-compose" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(() => api.teachbackExplain(room.id, { teachbackId: a.id, text: text.trim() }), 'Your explanation did not send.'); }}>
        <label className="act-label" htmlFor="tb-text">Your explanation</label>
        <textarea id="tb-text" className="textarea" rows={5} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          placeholder="Explain it as if a classmate missed it. Plain words are best." autoFocus />
        <div className="act-foot">
          <span className="act-time"><span className="mono">{clock(timeLeft(a, now))}</span> left</span>
          <button type="submit" className="btn primary" disabled={busy || !text.trim()}><Send {...ICON} />{busy ? 'Sending' : 'Submit'}</button>
        </div>
      </form>
    );
  } else if (!a.explanation) {
    body = (
      <div className="act-foot">
        <p className="act-note"><strong>{a.volunteer.name}</strong> is writing an explanation.</p>
        <span className="act-time"><span className="mono">{clock(timeLeft(a, now))}</span> left</span>
      </div>
    );
  } else {
    body = (
      <>
        <div className="tb-said">
          <p className="tb-who">{a.explanation.userId === me ? 'You explained' : `${a.explanation.name} explained`}</p>
          <p className="tb-text">{a.explanation.text}</p>
        </div>
        {a.feedback ? (
          <div className="tb-feedback">
            <p className="tb-who">The tutor</p>
            <Markdown className="tb-md" text={a.feedback.markdown} />
            {a.feedback.missing.length > 0 && (
              <>
                <h4 className="tb-sub">What was missing</h4>
                <ul className="tb-missing">{a.feedback.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </>
            )}
          </div>
        ) : <p className="act-note"><Stamp tone="pending">Reading</Stamp> The tutor is reading it.</p>}
      </>
    );
  }

  return (
    <div className="tb-layer">
      <section className="act-leaf tb-leaf acetate hinge-in" aria-label="Teach-back">
        <header className="act-head">
          <h3>Teach-back</h3>
          {a.volunteer && !a.feedback && <Stamp tone="ink">{a.volunteer.userId === me ? 'You explain' : a.volunteer.name}</Stamp>}
          <span className="spacer" />
          {a.feedback && <button type="button" className="btn ghost small" onClick={onClose}><X {...ICON} />Close</button>}
        </header>
        <p className="tb-concept">{a.concept}</p>
        {body}
        {error && <p className="errata" role="alert">{error}</p>}
      </section>
    </div>
  );
}

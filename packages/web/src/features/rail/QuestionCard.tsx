// A1 (Dev A): one card in the question rail: a cluster (or a lone question), its status stamp,
// the questions merged into it, the inline answer or class credit, the anonymous +1 and,
// when a thread is offered to me, the way in.
import { useState } from 'react';
import { ArrowUpRight, Check, Pin, Split } from 'lucide-react';
import { Stamp } from '../../ui/Stamp';
import { selectIsHost, useRoom } from '../../room/store';
import { api } from '../../lib/api';
import { hostApi } from '../gate/hostApi';
import { creditLine, type RailCard } from './railModel';
import { nameFor } from '../../lib/text';

const ICON = { size: 12, strokeWidth: 2.5 } as const;

export function QuestionCard({ card, stale, arriving = false }: { card: RailCard; stale: boolean; arriving?: boolean }) {
  const me = useRoom((s) => s.me);
  const myName = useRoom((s) => (s.me ? s.members[s.me]?.display_name ?? null : null));
  const room = useRoom((s) => s.room)!;
  const openThreadId = useRoom((s) => s.openThreadId);
  const isHost = useRoom(selectIsHost);
  const [splitting, setSplitting] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pinned, setPinned] = useState<'no' | 'pinning' | 'yes'>('no');

  const { cluster, questions, status } = card;
  const lone = questions.length === 1 && (!cluster || cluster.title === questions[0].text);
  const target = questions.find((q) => q.author_id !== me);
  const anchored = questions.find((q) => q.anchor)?.anchor?.shapeIds.length ?? 0;
  const settled = card.answeredInClass || status === 'answered' || card.threadDone;
  const name = (n: string, id: string) => nameFor(id, n, me);

  const vote = () => {
    if (!target) return;
    setError('');
    api.vote(target.id).then(() => setVoted((v) => !v)).catch((e) => setError(`Could not count your +1. ${(e as Error).message}`));
  };

  // lane Q: triage merged a different question in here; take it back out (asker or host)
  const canSplit = (q: (typeof questions)[number]) =>
    !lone && questions.length > 1 && (isHost || q.author_id === me) && !!q.cluster_id && q.status !== 'pending' && q.status !== 'flagged' && q.status !== 'thread';
  const unmerge = (questionId: string) => {
    setSplitting(questionId);
    setError('');
    // the card splits when the question and cluster rows arrive on the room channel
    api.unmerge(questionId)
      .catch((e) => setError(`Could not take that question out of the group. ${(e as Error).message}`))
      .finally(() => setSplitting(null));
  };

  // the host moves this question up to the next Q&A (lane C's endpoint)
  const canPin = isHost && !settled && (status === 'pending' || status === 'later');
  const pin = () => {
    setPinned('pinning');
    setError('');
    hostApi.pin(room.id, { questionId: questions[0].id })
      .then(() => setPinned('yes'))
      .catch((e) => { setPinned('no'); setError(`Could not pin this to the next Q&A. ${(e as Error).message}`); });
  };

  const enterThread = () => {
    if (card.myThread) { useRoom.setState({ openThreadId: card.myThread.id }); return; }
    setBusy(true);
    setError('');
    const body = card.offered ? { threadId: card.offered.id } : { questionId: questions.find((q) => q.author_id === me)?.id, topic: card.title.slice(0, 120) };
    api.openThread(room.id, body)
      .then((t) => useRoom.setState((s) => ({ threads: { ...s.threads, [t.id]: t }, openThreadId: t.id })))
      .catch((e) => setError(`Could not open the thread. ${(e as Error).message} Try again.`))
      .finally(() => setBusy(false));
  };

  return (
    <article className={`qcard${arriving ? ' note-in' : ''}${card.attention ? ' attention' : ''}${settled ? ' settled' : ''}${card.mine ? ' mine' : ''}`} aria-label={card.title}>
      <header className="qcard-head">
        <span key={`${status}-${card.answeredInClass}-${stale}`} className="step-in"><StatusStamp card={card} stale={stale} segment={room.segment} /></span>
        <span className="spacer" />
        {status !== 'flagged' && (target ? (
          <button type="button" className="btn small qvote" aria-pressed={voted} onClick={vote}
            aria-label={voted ? `Take back your +1. ${card.votes} so far` : `Add an anonymous +1. ${card.votes} so far`}
            title="Anonymous +1: nobody sees who added it">
            +1{card.votes > 0 && <span className="mono qvote-n">{card.votes}</span>}
          </button>
        ) : card.votes > 0 && (
          <span className="qvote-static" aria-label={`${card.votes} anonymous +1`}>+1<span className="mono qvote-n">{card.votes}</span></span>
        ))}
      </header>

      <h3 className="qcard-title">{card.title}</h3>

      {lone ? (
        <p className="qcard-by">{name(questions[0].author_name, questions[0].author_id)} asked</p>
      ) : (
        <ul className="qcard-list" aria-label="Questions in this group">
          {questions.map((q) => (
            <li key={q.id}>
              <span className="qcard-who">{name(q.author_name, q.author_id)}</span>
              <span className="qcard-text">{q.text}</span>
              {canSplit(q) && (
                <button type="button" className="btn ghost small qcard-split" onClick={() => unmerge(q.id)} disabled={splitting !== null}
                  aria-label={`Not the same question: take "${q.text}" out of this group`}>
                  <Split size={13} strokeWidth={2.25} aria-hidden />{splitting === q.id ? 'Taking it out' : 'Not the same question'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {anchored > 0 && (
        <p className="qcard-meta"><Pin {...ICON} aria-hidden />Pinned to <span className="mono">{anchored}</span> {anchored === 1 ? 'shape' : 'shapes'} on the board</p>
      )}

      <Body card={card} stale={stale} />

      {card.answeredInClass && card.askers.length > 0 && (
        <p className="qcard-credit"><Check {...ICON} aria-hidden />{creditLine(card.askers, myName)}</p>
      )}

      {canPin && (
        <div className="qcard-actions">
          {pinned === 'yes' ? (
            <span className="qcard-pinned"><Pin {...ICON} aria-hidden />Pinned to the next Q&amp;A</span>
          ) : (
            <button type="button" className="btn small" onClick={pin} disabled={pinned === 'pinning'}
              title="The tutor answers this for the class at the next Q&A">
              <Pin size={14} strokeWidth={2.25} aria-hidden />
              {pinned === 'pinning' ? 'Pinning' : 'Pin to next Q&A'}
            </button>
          )}
        </div>
      )}

      {status === 'thread' && card.mine && !card.threadDone && openThreadId !== card.myThread?.id && (
        <div className="qcard-actions">
          {/* secondary: the thread offer slip on the board carries the one yellow Open thread */}
          <button type="button" className="btn small" onClick={enterThread} disabled={busy}>
            <ArrowUpRight size={14} strokeWidth={2.25} aria-hidden />{card.myThread ? 'Go to thread' : busy ? 'Opening' : 'Open thread'}
          </button>
        </div>
      )}

      {error && <p className="errata" role="alert">{error}</p>}
    </article>
  );
}

function StatusStamp({ card, stale, segment }: { card: RailCard; stale: boolean; segment: number }) {
  if (card.answeredInClass) return <Stamp tone="ok">Answered in class</Stamp>;
  switch (card.status) {
    case 'pending': return <Stamp tone="pending">{stale ? 'Still sorting' : 'Sorting'}</Stamp>;
    case 'grouped': {
      const n = card.cluster?.asker_count ?? card.askers.length;
      return <Stamp tone="section">Grouped · <span className="mono">{n}</span> asked</Stamp>;
    }
    case 'later': {
      const at = card.cluster?.target_segment;
      if (at == null || at === segment + 1) return <Stamp tone="ink">Coming up next</Stamp>;
      if (at === segment) return <Stamp tone="ink">Coming up now</Stamp>;
      if (at < segment) return <Stamp tone="ink">Covered in segment <span className="mono">{at + 1}</span></Stamp>;
      return <Stamp tone="ink">Coming up in segment <span className="mono">{at + 1}</span></Stamp>;
    }
    case 'answered': return <Stamp tone="ok">Answered</Stamp>;
    case 'thread':
      if (card.myThread) return <Stamp tone="ink">In your thread</Stamp>;
      if (card.threadDone) return <Stamp tone="muted">Talked in a thread</Stamp>;
      return <Stamp tone="ink">Thread offered</Stamp>;
    case 'flagged': return <Stamp tone="muted">Only you see this</Stamp>;
  }
}

function Body({ card, stale }: { card: RailCard; stale: boolean }) {
  const room = useRoom((s) => s.room)!;
  const { cluster, status } = card;
  if ((status === 'answered' || card.answeredInClass) && cluster?.answer) return <p className="qcard-answer">{cluster.answer}</p>;
  if (card.answeredInClass) return null;
  if (status === 'pending' && stale) return <p className="qcard-note">The tutor is still reading this. It stays here until it is sorted.</p>;
  if (status === 'grouped') return <p className="qcard-note">The tutor answers this for the whole class in the next Q&amp;A.</p>;
  if (status === 'later') {
    const at = cluster?.target_segment;
    const title = at != null ? room.lesson_plan?.segments[at]?.title : undefined;
    return title ? <p className="qcard-note">The lesson covers this in <strong>{title}</strong>.</p> : <p className="qcard-note">The lesson plan covers this soon.</p>;
  }
  if (status === 'thread' && card.mine && !card.myThread && !card.threadDone) {
    const topic = card.offered?.topic;
    return <p className="qcard-note">Want to dig into {topic ? <strong>{topic}</strong> : 'this'} one to one? The class carries on, and you can come back any time.</p>;
  }
  if (status === 'thread' && !card.mine) return <p className="qcard-note">The tutor offered the asker a one to one thread on this.</p>;
  if (status === 'flagged') return <p className="qcard-note">This looks off topic, so only you can see it. Rephrase it to ask again.</p>;
  return null;
}

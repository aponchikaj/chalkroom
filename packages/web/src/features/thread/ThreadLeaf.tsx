// A3 (Dev A): the thread as a milk-acetate leaf hinged over the board (design doc, "Threads in
// detail"). Its own mini board (a second Player fed by a StreamSync on the thread stream), the
// chat transcript, a composer for the owner, a live picture-in-picture of the class, and a
// read-only "peek" mode for everyone else.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Eye, SendHorizontal, Share2, UserPlus } from 'lucide-react';
import type { StreamEvent } from '@chalk/schema';
import { mainPlayer, useRoom } from '../../room/store';
import { useRoomConn } from '../../room/context';
import { Board } from '../../board/Board';
import { Player } from '../../lib/player';
import { StreamSync } from '../../lib/sync';
import { api } from '../../lib/api';
import { Markdown } from '../../components/Markdown';
import { Stamp } from '../../ui/Stamp';
import './thread.css';
import { nameFor } from '../../lib/text';

type Chat = StreamEvent<'chat'>;
const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
/** no tutor reply after this long: tell the learner instead of spinning forever */
const REPLY_TIMEOUT_MS = 45_000;

export function ThreadLeaf({ threadId }: { threadId: string }) {
  const thread = useRoom((s) => s.threads[threadId]);
  const me = useRoom((s) => s.me);
  const ownerName = useRoom((s) => (thread ? s.members[thread.owner_id]?.display_name : undefined)) ?? 'a classmate';
  const members = useRoom((s) => s.members);
  const conn = useRoomConn();
  const mine = !!thread && thread.owner_id === me;
  // lane Q: a classmate who joined from a peek writes here too
  const joined = !!thread && !!me && !mine && (thread.members ?? []).includes(me);
  const writer = mine || joined;
  const streamId = thread?.stream_id;

  const player = useMemo(() => new Player({ silent: true }), [streamId]);
  const [chat, setChat] = useState<Chat[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [joining, setJoining] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLOListElement>(null);

  // the thread stream: snapshot + live events, chat lines to the transcript, the rest to the mini board
  useEffect(() => {
    if (!conn || !streamId) return;
    let alive = true;
    setChat([]);
    const sync = new StreamSync(streamId, (after) => conn.fetchEvents(streamId, after), (ev, live) => {
      if (!alive) return;
      if (ev.kind === 'chat') {
        const c = ev as Chat;
        setChat((xs) => [...xs, c]);
        if (live && c.data.role === 'tutor') setPending(false);
      } else player.push(ev, live);
    });
    const off = conn.onEvent((ev) => sync.receive(ev));
    sync.start().catch((e) => alive && setError(`Could not load this thread: ${(e as Error).message}. Close it and open it again.`));
    return () => { alive = false; off(); player.reset(); };
  }, [conn, streamId, player]);

  // presence: the owner and joined members are "in a thread" (peeking does not excuse anyone from the gate)
  useEffect(() => {
    if (!conn || !writer) return;
    conn.track({ threadId });
    return () => conn.track({ threadId: null });
  }, [conn, writer, threadId]);

  useEffect(() => {
    (writer ? composerRef.current : backRef.current)?.focus();
  }, [writer]);

  const join = async () => {
    setJoining(true);
    setError('');
    try {
      const t = await api.joinThread(threadId);
      // the row broadcast brings the same row; apply it now so the composer appears at once
      useRoom.setState((s) => ({ threads: { ...s.threads, [t.id]: t } }));
    } catch (e) {
      setError(`Could not join this thread: ${(e as Error).message}. Try Join this thread again.`);
    } finally {
      setJoining(false);
    }
  };

  // keep the newest line in view: on open, on each message, and while replies and the leaf settle
  // (markdown, maths and the share button change height after the first paint); scrolling up to
  // reread lets go until the next message
  const stick = useRef(true);
  useEffect(() => { stick.current = true; }, [chat.length, pending]);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    let at = el.scrollTop;
    const toEnd = () => { if (stick.current) { el.scrollTop = el.scrollHeight; at = el.scrollTop; } };
    // only a scroll back up lets go; growth below the fold must not
    const onScroll = () => {
      if (el.scrollTop < at - 4) stick.current = false;
      else if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) stick.current = true;
      at = el.scrollTop;
    };
    const ro = new ResizeObserver(toEnd);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    toEnd();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, [chat.length, pending, sharing]);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      setPending(false);
      setError('The tutor has not answered yet. Send your message again, or go back to class and try later.');
    }, REPLY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pending]);

  const back = async () => {
    if (!mine || thread?.status !== 'open') { useRoom.setState({ openThreadId: null }); return; }
    setClosing(true);
    setError('');
    try {
      await api.closeThread(threadId);
      useRoom.setState({ openThreadId: null });
    } catch (e) {
      setError(`Could not close the thread: ${(e as Error).message}. Try Back to class again.`);
      setClosing(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    setError('');
    setPending(true);
    try {
      await api.threadMessage(threadId, { text });
      setDraft('');
    } catch (e) {
      setPending(false);
      setError(`Could not send your message: ${(e as Error).message}. Your text is still here; send it again.`);
    }
    composerRef.current?.focus();
  };

  const lastTutor = [...chat].reverse().find((c) => c.data.role === 'tutor');
  const shared = !!lastTutor && thread?.shared_answer === lastTutor.data.markdown;
  const share = async () => {
    if (!lastTutor) return;
    setSharing(true);
    setError('');
    try {
      await api.shareThread(threadId, { markdown: lastTutor.data.markdown.slice(0, 2000) });
    } catch (e) {
      setError(`Could not share the answer: ${(e as Error).message}. Try Share to class again.`);
    } finally {
      setSharing(false);
    }
  };

  const nameOf = (c: Chat) => {
    if (c.data.role === 'tutor') return 'Tutor';
    const id = c.data.authorId ?? thread?.owner_id;
    return nameFor(id, (id && members[id]?.display_name) || ownerName, me);
  };
  const closed = thread?.status === 'closed';
  const joinedNames = (thread?.members ?? []).map((id) => nameFor(id, members[id]?.display_name ?? 'a classmate', me));
  const canJoin = !!thread && !writer && thread.status === 'open';

  return (
    <section className="thread-leaf acetate hinge-in" aria-label={thread ? `Thread: ${thread.topic}` : 'Thread'}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); void back(); } }}>
      <header className="tl-head">
        <div className="tl-title">
          <h2>{thread?.topic ?? 'Opening the thread'}</h2>
          <p className="tl-who">
            {mine ? (joinedNames.length ? <>Your thread with the tutor. Joined: {joinedNames.join(', ')}.</> : 'Your 1:1 with the tutor. The class keeps going.')
              : joined ? <>You joined {ownerName}'s thread{joinedNames.length > 1 ? `, with ${joinedNames.filter((n) => n !== 'You').join(', ')}` : ''}. The class keeps going.</>
              : <><Eye {...ICON} /> Peeking at {ownerName}'s thread{joinedNames.length ? ` with ${joinedNames.join(', ')}` : ''}. Read-only.</>}
            {closed && <Stamp tone="muted">Closed</Stamp>}
          </p>
        </div>
        <ClassPip />
        <button ref={backRef} className="btn tl-back" onClick={() => void back()} disabled={closing}>
          <ArrowLeft {...ICON} />{closing ? 'Closing' : 'Back to class'}
        </button>
      </header>

      <div className="tl-board">
        <Board player={player} id="thread-board" emptyHint="The tutor draws here when it explains" />
      </div>

      <ol className="tl-log" ref={logRef} aria-label="Thread chat" aria-live="polite">
        {!chat.length && <li className="tl-empty">{writer ? 'Ask your question below. The tutor answers here and on the board above.' : 'No messages yet.'}</li>}
        {chat.map((c) => (
          <li key={c.seq} className={`tl-msg tl-${c.data.role}`}>
            <span className="tl-name">{nameOf(c)}</span>
            {c.data.role === 'tutor' ? <Markdown text={c.data.markdown} className="tl-text" /> : <p className="tl-text">{c.data.markdown}</p>}
            {mine && c === lastTutor && (
              <div className="tl-share">
                {shared ? <Stamp tone="ok">Shared to class</Stamp> : (
                  <button className="btn small" onClick={() => void share()} disabled={sharing}>
                    <Share2 {...ICON} />{sharing ? 'Sharing' : 'Share to class'}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
        {pending && <li className="tl-msg tl-tutor tl-waiting"><span className="tl-name">Tutor</span><p className="tl-text">Writing an answer</p></li>}
      </ol>

      {error && <div className="errata tl-error" role="alert">{error}</div>}

      {writer && !closed ? (
        <form className="tl-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label className="sr-only" htmlFor="thread-composer">Message the tutor</label>
          <textarea id="thread-composer" ref={composerRef} className="textarea" rows={2} value={draft} maxLength={1000}
            placeholder="Ask a follow-up" onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
          <div className="tl-send">
            <button type="submit" className="btn primary" disabled={!draft.trim() || pending}>
              <SendHorizontal {...ICON} />{pending ? 'Waiting' : 'Send'}
            </button>
            <span className="tl-hint"><span className="kbd">Enter</span> sends, <span className="kbd">Shift</span>+<span className="kbd">Enter</span> new line</span>
          </div>
        </form>
      ) : canJoin ? (
        <div className="tl-readonly tl-join">
          <p>Same question? Join to ask the tutor here with {ownerName}.</p>
          <button className="btn primary" onClick={() => void join()} disabled={joining}>
            <UserPlus {...ICON} />{joining ? 'Joining' : 'Join this thread'}
          </button>
        </div>
      ) : (
        <p className="tl-readonly">{closed ? 'This thread is closed.' : `Only ${ownerName} can write here.`}</p>
      )}
    </section>
  );
}

/** The class, live and small, so the learner always knows the lesson continues. */
function ClassPip() {
  const room = useRoom((s) => s.room);
  const latestTitle = useRoom((s) => {
    for (let i = s.mainEvents.length - 1; i >= 0; i--) {
      const ev = s.mainEvents[i];
      if (ev.kind === 'segment_start') return (ev.data as StreamEvent<'segment_start'>['data']).title;
    }
    return undefined;
  });
  if (!room) return null;
  const title = room.lesson_plan?.segments[room.segment]?.title ?? latestTitle;
  const label = room.phase === 'ended' ? 'Class ended' : `Class: segment ${room.segment + 1}${title ? `, ${title}` : ''}`;
  return (
    <figure className="tl-pip" aria-label={`${label}. Live view of the main board.`}>
      <Board player={mainPlayer} id="pip-board" />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

// A3 (Dev A): the thread drawer, a sheet of tracing paper held over the class by a binder clip
// (design doc, "Threads in detail"). Every thread this person can see (their own, the ones they
// joined, the ones they peeked at this class) is a collapsible section: a header with the topic,
// owner and status, then that thread's mini board (a second Player fed by a StreamSync on the
// thread stream), its messages, and the follow-up box right under them. People choose which
// sections to open; their own open thread starts open, and the choices are remembered per class
// for the session. A live picture-in-picture of the class stays in the drawer's head.
//
// "Back to class" closes the drawer at once, and the person's own open thread when they were in
// it (not when they only came to peek at someone else's); if closing fails, the drawer comes back
// with the reason. Focus returns to whatever opened the drawer, else the main ask box.
// Folded sections stay mounted (hidden), so a draft, a pending reply and the loaded chat survive.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronDown, Eye, SendHorizontal, Share2, UserPlus, X } from 'lucide-react';
import type { StreamEvent, ThreadRow } from '@chalk/schema';
import { mainPlayer, useRoom } from '../../room/store';
import { useRoomConn } from '../../room/context';
import { Board } from '../../board/Board';
import { Player } from '../../lib/player';
import { StreamSync } from '../../lib/sync';
import { api } from '../../lib/api';
import { Markdown } from '../../components/Markdown';
import { Stamp } from '../../ui/Stamp';
import { transition } from '../../ui/motion';
import { nameFor } from '../../lib/text';
import { readExpanded, readPeeked, rememberPeek, useThreadUi, writeExpanded } from './focus';
import { PHONE_QUERY } from '../phone';
import './thread.css';

type Chat = StreamEvent<'chat'>;
const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
/** no tutor reply after this long: tell the learner instead of spinning forever */
const REPLY_TIMEOUT_MS = 45_000;
const vtId = (id: string) => `tl-sec-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

/** What had focus when the drawer opened: it gets focus back after Back to class. */
let opener: { el: Element | null; label: string | null } = { el: null, label: null };
function rememberOpener() {
  const el = document.activeElement;
  opener = el && el !== document.body ? { el, label: el.getAttribute('aria-label') } : { el: null, label: null };
}
function restoreFocus() {
  // the opener (a Peek or Go to thread button) may have been re-rendered: find it by its label
  const again = opener.label ? document.querySelector(`[aria-label="${CSS.escape(opener.label)}"]`) : null;
  const target = (opener.el?.isConnected ? opener.el : again) ?? document.querySelector('.askbar textarea, .askbar input');
  (target as HTMLElement | null)?.focus({ preventScroll: true });
}

/**
 * Close the drawer now. My own open thread closes behind it only when I was in it: it is the
 * thread the drawer opened on, or its section is unfolded. Reopens with the reason if that fails.
 */
export function backToClass(openedId: string | null, ownExpanded: boolean) {
  const s = useRoom.getState();
  const own = Object.values(s.threads).find((t) => t.owner_id === s.me && t.status === 'open');
  useThreadUi.setState({ closeError: null });
  void transition(() => useRoom.setState({ openThreadId: null })).then(restoreFocus, restoreFocus);
  if (!own || (own.id !== openedId && !ownExpanded)) return;
  api.closeThread(own.id).catch((e) => {
    useThreadUi.setState({ closeError: { threadId: own.id, text: `Could not close your thread: ${(e as Error).message}. Try Back to class again.` } });
    // the thread is still open on the server: show it again so nothing is lost
    if (useRoom.getState().threads[own.id]?.status === 'open') void transition(() => useRoom.setState({ openThreadId: own.id }));
  });
}

export function ThreadLeaf({ threadId }: { threadId: string }) {
  const roomId = useRoom((s) => s.room?.id ?? '');
  const me = useRoom((s) => s.me);
  const threads = useRoom((s) => s.threads);
  const conn = useRoomConn();
  const closeError = useThreadUi((s) => s.closeError);
  const backRef = useRef<HTMLButtonElement>(null);
  // once per drawer: remember who opened it (runs during the first render, before focus moves)
  useState(rememberOpener);

  const opened = threads[threadId];
  const isMine = (t: ThreadRow) => t.owner_id === me;
  const isJoined = (t: ThreadRow) => !!me && t.owner_id !== me && (t.members ?? []).includes(me);

  // a thread opened from a peek joins this class's "seen" list
  useEffect(() => {
    if (roomId && opened && !isMine(opened) && !isJoined(opened)) rememberPeek(roomId, threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, threadId, !!opened]);

  const visible = useMemo(() => {
    const peeked = new Set(roomId ? readPeeked(roomId) : []);
    const rank = (t: ThreadRow) => (isMine(t) ? 0 : isJoined(t) ? 1 : 2);
    return Object.values(threads)
      .filter((t) => t.id === threadId || (t.status === 'open' && (isMine(t) || isJoined(t) || peeked.has(t.id))))
      .sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, threadId, me, roomId]);

  // which sections are open: remembered per class; my open thread and the one just opened start open
  const withDefaults = (cur: Record<string, boolean>) => {
    const next = { ...cur, [threadId]: true };
    for (const t of visible) if (isMine(t) && t.status === 'open' && cur[t.id] === undefined) next[t.id] = true;
    return next;
  };
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => withDefaults(roomId ? readExpanded(roomId) : {}));
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; if (roomId) writeExpanded(roomId, expanded); return; }
    setExpanded((cur) => {
      const next = withDefaults(cur);
      if (roomId) writeExpanded(roomId, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, visible.length]);
  const toggle = (id: string) => {
    const next = { ...expanded, [id]: !expanded[id] };
    if (roomId) writeExpanded(roomId, next);
    void transition(() => setExpanded(next));
  };

  // presence: the owner and joined members are "in a thread" (peeking does not excuse anyone from the gate)
  const writing = visible.find((t) => t.status === 'open' && (isMine(t) || isJoined(t)))?.id ?? null;
  useEffect(() => {
    if (!conn || !writing) return;
    conn.track({ threadId: writing });
    return () => conn.track({ threadId: null });
  }, [conn, writing]);

  // focus: the follow-up box of the thread just opened when I can write there, else Back to class
  useEffect(() => {
    const t = useRoom.getState().threads[threadId];
    const box = document.getElementById(`thread-composer-${threadId}`) as HTMLTextAreaElement | null;
    // without scrolling: the section that follows keeps its newest line and the box in view itself
    if (t && box && (isMine(t) || isJoined(t))) box.focus({ preventScroll: true }); else backRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const count = visible.length;
  const own = visible.find((t) => isMine(t) && t.status === 'open');
  const back = () => backToClass(threadId, !!own && !!expanded[own.id]);
  // the section that follows its newest line: the one I write in, else the one just opened
  const follow = writing ?? threadId;

  return (
    <section className="thread-leaf tracing" aria-label={count > 1 ? `Threads, ${count}` : opened ? `Thread: ${opened.topic}` : 'Thread'}
      style={{ viewTransitionName: 'thread-drawer' } as CSSProperties}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); back(); } }}>
      <BinderClip />
      <header className="tl-head">
        <div className="tl-title">
          <h2>{count > 1 ? 'Side threads' : 'Side thread'}</h2>
          <p className="tl-who">
            {count > 1 ? <>Open the ones you want to read. The class keeps going underneath.</> : <>The class keeps going underneath.</>}
          </p>
        </div>
        <ClassPip />
        <button ref={backRef} type="button" className="btn tl-back" onClick={back} aria-label="Back to class">
          <ArrowLeft {...ICON} /><span><span className="tl-back-long">Back to </span>class</span>
        </button>
      </header>

      {closeError && (
        <div className="errata tl-error" role="alert">
          <span className="grow">{closeError.text}</span>
          <button type="button" className="btn ghost small icon-btn" onClick={() => useThreadUi.setState({ closeError: null })} aria-label="Dismiss this message"><X size={14} strokeWidth={2.25} /></button>
        </div>
      )}

      <div className="tl-scroll">
        {visible.map((t) => (
          <ThreadSection key={t.id} thread={t} open={!!expanded[t.id]} onToggle={() => toggle(t.id)} only={count === 1} follow={t.id === follow} />
        ))}
        {!visible.length && <p className="tl-empty">Opening the thread.</p>}
      </div>
    </section>
  );
}

/** The clip that holds the tracing paper over the class. Drawn, not an icon. */
function BinderClip() {
  return (
    <svg className="tl-clip" viewBox="0 0 64 46" width="64" height="46" aria-hidden focusable="false">
      <path d="M20 26 L15 6 Q14.5 3 17.5 3 L46.5 3 Q49.5 3 49 6 L44 26" fill="none" stroke="#8d8b84" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M20 26 L15 6" fill="none" stroke="#c9c6bd" strokeWidth="0.9" />
      <path d="M9 22 L55 22 L60 41 Q60.6 44 57.6 44 L6.4 44 Q3.4 44 4 41 Z" fill="#1d1c1a" />
      <path d="M11 24.5 L53 24.5" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" />
      <path d="M6.5 41.5 L57.5 41.5" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
    </svg>
  );
}

function ThreadSection({ thread, open, onToggle, only, follow }: { thread: ThreadRow; open: boolean; onToggle: () => void; only: boolean; follow: boolean }) {
  const me = useRoom((s) => s.me);
  const members = useRoom((s) => s.members);
  const ownerName = members[thread.owner_id]?.display_name ?? 'a classmate';
  const mine = thread.owner_id === me;
  const joined = !!me && !mine && (thread.members ?? []).includes(me);
  const closed = thread.status === 'closed';
  const joinedNames = (thread.members ?? []).map((id) => nameFor(id, members[id]?.display_name ?? 'a classmate', me));
  const bodyId = `tl-body-${thread.id}`;

  const who = mine ? (joinedNames.length ? `Your thread, with ${joinedNames.join(', ')}` : 'Your 1:1 with the tutor')
    : joined ? `${ownerName}'s thread, you joined`
    : `${ownerName}'s thread, read-only`;
  const stamp = closed ? <Stamp tone="muted">Closed</Stamp>
    : mine ? <Stamp tone="ink">Yours</Stamp>
    : joined ? <Stamp tone="section">Joined</Stamp>
    : <Stamp tone="pending" icon={<Eye size={12} strokeWidth={2.5} aria-hidden />}>Peeking</Stamp>;

  return (
    <article className={`tl-sec${open ? ' open' : ''}${only ? ' only' : ''}`} style={{ viewTransitionName: vtId(thread.id) } as CSSProperties}>
      <h3 className="tl-sec-h">
        <button type="button" className="tl-sec-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <ChevronDown className="tl-chev" size={18} strokeWidth={2.25} aria-hidden />
          <span className="tl-sec-title">
            <span className="tl-sec-topic">{thread.topic}</span>
            <span className="tl-sec-who">{who}</span>
          </span>
          {stamp}
        </button>
      </h3>
      {/* folded stays mounted: the draft, a pending reply and the loaded stream are kept */}
      <div id={bodyId} className="tl-sec-body" hidden={!open}>
        <ThreadBody thread={thread} mine={mine} joined={joined} ownerName={ownerName} follow={follow && open} />
      </div>
    </article>
  );
}

function ThreadBody({ thread, mine, joined, ownerName, follow }: { thread: ThreadRow; mine: boolean; joined: boolean; ownerName: string; follow: boolean }) {
  const me = useRoom((s) => s.me);
  const members = useRoom((s) => s.members);
  const conn = useRoomConn();
  const threadId = thread.id;
  const writer = mine || joined;
  const streamId = thread.stream_id;

  const player = useMemo(() => new Player({ silent: true }), [streamId]);
  const [chat, setChat] = useState<Chat[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [joining, setJoining] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);

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
    sync.start().catch((e) => alive && setError(`Could not load this thread: ${(e as Error).message}. Go back to class and open it again.`));
    return () => { alive = false; off(); player.reset(); };
  }, [conn, streamId, player]);

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

  // keep the newest line and the follow-up box in view, in the drawer's one scroller: on open, on
  // each message, and while replies settle (markdown, maths and the share button change height
  // after the first paint). Scrolling up to reread lets go until the next message. Only the
  // section that follows (the one I write in, else the one just opened) moves the scroller.
  const stick = useRef(true);
  useEffect(() => { stick.current = true; }, [chat.length, pending, follow]);
  useEffect(() => {
    const log = logRef.current;
    const end = endRef.current;
    const sc = log?.closest<HTMLElement>('.tl-scroll');
    if (!follow || !log || !end || !sc) return;
    let at = sc.scrollTop;
    let frame = 0;
    const toEnd = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!stick.current) return;
        const below = end.getBoundingClientRect().bottom - sc.getBoundingClientRect().bottom + 16;
        if (below > 0) sc.scrollTop += below;
        at = sc.scrollTop;
      });
    };
    const onScroll = () => {
      if (sc.scrollTop < at - 4) stick.current = false;
      else if (end.getBoundingClientRect().bottom - sc.getBoundingClientRect().bottom < 40) stick.current = true;
      at = sc.scrollTop;
    };
    const ro = new ResizeObserver(toEnd);
    ro.observe(log);
    for (const c of log.children) ro.observe(c);
    // phones: the scroller itself shrinks when the keyboard opens or the phone turns
    if (matchMedia(PHONE_QUERY).matches) ro.observe(sc);
    toEnd();
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); ro.disconnect(); sc.removeEventListener('scroll', onScroll); };
  }, [chat.length, pending, sharing, follow]);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => {
      setPending(false);
      setError('The tutor has not answered yet. Send your message again, or go back to class and try later.');
    }, REPLY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pending]);

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
  const shared = !!lastTutor && thread.shared_answer === lastTutor.data.markdown;
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
    const id = c.data.authorId ?? thread.owner_id;
    return nameFor(id, (id && members[id]?.display_name) || ownerName, me);
  };
  const closed = thread.status === 'closed';
  const canJoin = !writer && thread.status === 'open';
  const composerId = `thread-composer-${threadId}`;

  return (
    <>
      <div className="tl-board">
        <Board player={player} id={`thread-board-${threadId}`} emptyHint="The tutor draws here when it explains" />
      </div>

      <ol className="tl-log" ref={logRef} aria-label={`Messages in ${thread.topic}`} aria-live="polite">
        {!chat.length && <li className="tl-empty">{writer ? 'Ask your question below. The tutor answers here and on the board above.' : 'No messages yet.'}</li>}
        {chat.map((c) => (
          <li key={c.seq} className={`tl-msg tl-${c.data.role}`}>
            <span className="tl-name">{nameOf(c)}</span>
            {c.data.role === 'tutor' ? <Markdown text={c.data.markdown} className="tl-text" /> : <p className="tl-text">{c.data.markdown}</p>}
            {mine && c === lastTutor && (
              <div className="tl-share">
                {shared ? <Stamp tone="ok">Shared to class</Stamp> : (
                  <button type="button" className="btn small" onClick={() => void share()} disabled={sharing}>
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
          <label className="sr-only" htmlFor={composerId}>Follow-up for the tutor in {thread.topic}</label>
          <textarea id={composerId} ref={composerRef} className="textarea" rows={2} value={draft} maxLength={1000}
            placeholder="Ask a follow-up" onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
          <div className="tl-send">
            <button type="submit" className="btn primary" disabled={!draft.trim() || pending}>
              <SendHorizontal {...ICON} />{pending ? 'Waiting' : 'Send'}
            </button>
            <span className="tl-hint"><span className="kbd">Enter</span> sends</span>
          </div>
        </form>
      ) : canJoin ? (
        <div className="tl-readonly tl-join">
          <p>Same question? Join to ask the tutor here with {ownerName}.</p>
          <button type="button" className="btn primary" onClick={() => void join()} disabled={joining}>
            <UserPlus {...ICON} />{joining ? 'Joining' : 'Join this thread'}
          </button>
        </div>
      ) : (
        <p className="tl-readonly">{closed ? 'This thread is closed.' : `Only ${ownerName} can write here.`}</p>
      )}
      <span ref={endRef} className="tl-end" aria-hidden />
    </>
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

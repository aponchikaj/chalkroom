// A3 (Dev A): the thread slips docked under the main board, always mounted: the thread offer ("Want to
// dig into bump seeds 1:1?"), the catch-up card after a thread ("While you were away: segment 2"),
// and other people's open threads with a Peek action.
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Eye, FastForward, MessagesSquare } from 'lucide-react';
import type { StreamEvent, ThreadRow } from '@chalk/schema';
import { mainPlayer, useRoom } from '../../room/store';
import { usePlayer } from '../../board/Board';
import { api } from '../../lib/api';
import './thread.css';

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
type Summary = StreamEvent<'segment_summary'>;

/** Dismissed offers and catch-ups, kept for the page's life so remounts do not bring them back. */
const dismissed = new Set<string>();

export function CatchUpCard() {
  const openThreadId = useRoom((s) => s.openThreadId);
  return (
    <div className="thread-slips">
      {!openThreadId && <ThreadOffer />}
      {!openThreadId && <CatchUp />}
      {!openThreadId && <PeekList />}
    </div>
  );
}

function useDismiss() {
  const [, bump] = useState(0);
  return (key: string) => { dismissed.add(key); bump((n) => n + 1); };
}

function ThreadOffer() {
  const offer = useRoom((s) => Object.values(s.threads).find((t) => t.owner_id === s.me && t.status === 'offered' && !dismissed.has(`offer:${t.id}`)));
  const roomId = useRoom((s) => s.room?.id);
  const dismiss = useDismiss();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [offer?.id]);
  if (!offer || !roomId) return null;

  const open = async () => {
    setBusy(true);
    setError('');
    try {
      const t = await api.openThread(roomId, { threadId: offer.id });
      useRoom.getState().applyRow({ table: 'threads', op: 'UPDATE', row: t });
      useRoom.setState({ openThreadId: t.id });
    } catch (e) {
      setError(`Could not open the thread: ${(e as Error).message}. Try Open again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="slip acetate step-in" role="dialog" aria-label="Thread offer">
      <p className="slip-lead"><MessagesSquare {...ICON} /><span>Want to dig into <b>{offer.topic}</b> 1:1? The class keeps going.</span></p>
      {error && <div className="errata" role="alert">{error}</div>}
      <div className="slip-actions">
        <button className="btn ghost small" onClick={() => dismiss(`offer:${offer.id}`)}>Not now</button>
        <button className="btn primary small" onClick={() => void open()} disabled={busy}>{busy ? 'Opening' : 'Open thread'}</button>
      </div>
    </section>
  );
}

/** My most recently closed thread that has not been caught up on yet. */
const selectReturned = (s: ReturnType<typeof useRoom.getState>): ThreadRow | undefined =>
  Object.values(s.threads)
    .filter((t) => t.owner_id === s.me && t.status === 'closed' && t.left_main_seq != null && !dismissed.has(`catchup:${t.id}`))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

function CatchUp() {
  const thread = useRoom(selectReturned);
  const left = thread?.left_main_seq ?? null;
  const missed = useRoom(useShallow((s) => (left == null ? [] : s.mainEvents.filter((e): e is Summary => e.kind === 'segment_summary' && e.seq > left))));
  const dismiss = useDismiss();
  const [replaying, setReplaying] = useState(false);
  usePlayer(mainPlayer);

  // the replay finished: back to normal pace and out of the way
  useEffect(() => {
    if (replaying && !mainPlayer.busy) {
      mainPlayer.pace = 1;
      setReplaying(false);
      if (thread) dismiss(`catchup:${thread.id}`);
    }
  }, [replaying, mainPlayer.busy, thread, dismiss]);

  if (!thread || left == null || !missed.length) return null;
  const segs = missed.map((m) => m.data.segment + 1);
  const head = segs.length === 1 ? `segment ${segs[0]} (${missed[0].data.title})` : `segments ${segs[0]} to ${segs[segs.length - 1]}`;

  const replay = () => {
    // rebuild the board as it was when I left, then play everything since at double pace
    const evs = useRoom.getState().mainEvents;
    mainPlayer.reset();
    for (const ev of evs) if (ev.seq <= left) mainPlayer.push(ev, false);
    mainPlayer.pace = 2;
    for (const ev of evs) if (ev.seq > left) mainPlayer.push(ev, true);
    setReplaying(true);
  };
  const skip = () => { mainPlayer.interrupt(); mainPlayer.pace = 1; };

  if (replaying) {
    return (
      <section className="slip acetate step-in" aria-label="Catch-up replay">
        <p className="slip-lead" role="status"><FastForward {...ICON} /><span>Replaying what you missed at <span className="mono">2x</span></span></p>
        <div className="slip-actions"><button className="btn small" onClick={skip}>Skip to now</button></div>
      </section>
    );
  }

  return (
    <section className="slip acetate step-in" role="dialog" aria-labelledby="catchup-title">
      <h3 id="catchup-title" className="slip-title">While you were away: {head}</h3>
      <ol className="catchup-list">
        {missed.map((m) => (
          <li key={m.seq}>
            <span className="catchup-seg"><span className="mono">{m.data.segment + 1}</span> {m.data.title}</span>
            <p className="catchup-sum">{m.data.summary.replace(/^[^\n]*:\n/, '')}</p>
          </li>
        ))}
      </ol>
      <div className="slip-actions">
        <button className="btn small" onClick={() => dismiss(`catchup:${thread.id}`)}>Got it</button>
        <button className="btn small" onClick={replay}><FastForward {...ICON} />Replay at 2x</button>
      </div>
    </section>
  );
}

/** Other people's open threads: the entry point for peeking (read-only). */
function PeekList() {
  const others = useRoom(useShallow((s) => Object.values(s.threads).filter((t) => t.status === 'open' && t.owner_id !== s.me)));
  const members = useRoom((s) => s.members);
  if (!others.length) return null;
  return (
    <ul className="peek-list" aria-label="Threads in progress">
      {others.map((t) => (
        <li key={t.id} className="peek acetate">
          <span className="peek-text">{members[t.owner_id]?.display_name ?? 'A classmate'} is in a thread on <b>{t.topic}</b></span>
          <button className="btn ghost small" onClick={() => useRoom.setState({ openThreadId: t.id })}
            aria-label={`Peek at ${members[t.owner_id]?.display_name ?? 'a classmate'}'s thread on ${t.topic}`}>
            <Eye {...ICON} />Peek
          </button>
        </li>
      ))}
    </ul>
  );
}

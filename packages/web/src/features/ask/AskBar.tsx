// A2 (Dev A): the ask bar. Type and press Enter; when shapes are selected on the board the
// question is pinned to them. Typing shows in presence. Text only: people never use a
// microphone (decision 2026-10-17); the AI tutor is the only voice.
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Pin, SendHorizontal, X } from 'lucide-react';
import { usePhone } from '../phone';
import { useRoom } from '../../room/store';
import { useRoomConn } from '../../room/context';
import { api, ApiError } from '../../lib/api';
import { addPendingAsk, dropPendingAsk } from './pending';
import './ask.css';

const MAX = 500;
const TYPING_IDLE_MS = 2_000;

function errorText(err: unknown) {
  if (err instanceof ApiError && err.status === 429) return 'Too many questions; wait a moment, then press Ask again.';
  if (err instanceof ApiError) return `${err.message}. Your question is still in the box.`;
  return 'Could not send your question. Check your connection, then press Ask again.';
}

export function AskBar() {
  const room = useRoom((s) => s.room)!;
  const selection = useRoom(useShallow((s) => s.selection));
  const conn = useRoomConn();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const typing = useRef({ on: false, timer: 0 });
  const ended = room.phase === 'ended';
  const muted = useRoom((s) => !!(s.me && s.members[s.me]?.muted));
  const closed = ended || muted;
  // while a side thread is open, this box still talks to the whole class: say so
  const inThread = useRoom((s) => !!s.openThreadId);
  const anchored = !closed && selection.length > 0;

  const setTyping = (on: boolean) => {
    window.clearTimeout(typing.current.timer);
    if (typing.current.on === on) return;
    typing.current.on = on;
    conn?.track({ typing: on });
  };
  const bumpTyping = () => {
    setTyping(true);
    typing.current.timer = window.setTimeout(() => setTyping(false), TYPING_IDLE_MS);
  };

  const submit = (raw: string) => {
    const body = raw.trim();
    if (!body || closed) return;
    const shapeIds = useRoom.getState().selection;
    const anchor = shapeIds.length ? { streamId: room.main_stream_id, shapeIds } : undefined;
    setSending(true);
    setError('');
    setTyping(false);
    // optimistic: the box clears and a pending sticky shows in the rail at once
    setText('');
    if (anchor) useRoom.setState({ selection: [] });
    const pendingId = addPendingAsk(body, shapeIds.length);
    api.ask(room.id, anchor ? { text: body, anchor } : { text: body })
      .then((row) => {
        // the row broadcast may already have landed (with a newer status): never overwrite it
        if (row && row.id) useRoom.setState((s) => (s.questions[row.id] ? {} : { questions: { ...s.questions, [row.id]: row } }));
      })
      .catch((err) => {
        setText((t) => t || body);
        if (anchor && !useRoom.getState().selection.length) useRoom.setState({ selection: shapeIds });
        setError(errorText(err));
      })
      .finally(() => { dropPendingAsk(pendingId); setSending(false); });
  };

  useEffect(() => () => {
    window.clearTimeout(typing.current.timer);
    if (typing.current.on) conn?.track({ typing: false });
  }, [conn]);

  const placeholder = ended ? 'Class has ended.' : muted ? 'The host muted your questions for now.'
    : anchored ? 'Ask about the selected shapes'
    : inThread ? 'Ask the class'
    : 'Ask anything';
  const canSend = !!text.trim() && !closed;
  const sendLabel = anchored ? 'Ask about this' : inThread ? 'Ask the class' : 'Ask';
  // phones: a square send button, so the box gets the width
  const phone = usePhone();

  return (
    <form className="askbar" onSubmit={(e) => { e.preventDefault(); submit(text); }} aria-busy={sending}>
      {error ? (
        <div className="ask-slip errata hinge-in" role="alert">
          <span className="grow">{error}</span>
          <button type="button" className="btn ghost small icon-btn ask-dismiss" onClick={() => setError('')} aria-label="Dismiss this message"><X size={14} strokeWidth={2.25} /></button>
        </div>
      ) : null}

      {anchored && (
        <span className="ask-anchor step-in">
          <Pin size={14} strokeWidth={2.25} aria-hidden />
          <span>Pinned to <span className="mono">{selection.length}</span> {selection.length === 1 ? 'shape' : 'shapes'}</span>
          <button type="button" className="btn ghost small icon-btn ask-dismiss" onClick={() => useRoom.setState({ selection: [] })}
            aria-label="Clear the selection and ask about the whole lesson" title="Clear the selection">
            <X size={14} strokeWidth={2.25} />
          </button>
        </span>
      )}

      <span className="ask-field">
        <input className="input" placeholder={placeholder} value={text} maxLength={MAX}
          disabled={closed} aria-label={anchored ? 'Ask about the selected shapes' : inThread ? 'Ask the class a question' : 'Ask a question'}
          aria-invalid={!!error || undefined}
          onChange={(e) => { setText(e.target.value); setError(''); if (e.target.value) bumpTyping(); else setTyping(false); }}
          onBlur={() => setTyping(false)} />
        {text.length > MAX - 100 && <span className="ask-count mono" aria-live="polite">{text.length}/{MAX}</span>}
      </span>

      {phone ? (
        <button type="submit" className={`btn ask-send${canSend ? ' primary' : ''}`} disabled={!canSend} aria-label={sendLabel} title={sendLabel}>
          <SendHorizontal size={18} strokeWidth={2.25} aria-hidden />
        </button>
      ) : (
        <button type="submit" className={`btn${canSend ? ' primary' : ''}`} disabled={!canSend}>
          {sendLabel}
        </button>
      )}
    </form>
  );
}

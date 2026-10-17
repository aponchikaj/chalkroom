// A2 (Dev A): the ask bar. Type and press Enter, hold Space (or the mic) to talk, and when
// shapes are selected on the board the question is pinned to them. Typing shows in presence.
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Mic, MicOff, Pin, X } from 'lucide-react';
import { useRoom } from '../../room/store';
import { useRoomConn } from '../../room/context';
import { api, ApiError } from '../../lib/api';
import { Listener, sttSupported } from '../../lib/stt';
import './ask.css';

const MAX = 500;
const TYPING_IDLE_MS = 2_000;
/** Space starts talking only when focus is not on something Space already operates. */
const SPACE_OWNERS = 'input, textarea, select, button, a[href], [contenteditable=""], [contenteditable="true"], [role="button"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], [role="slider"], [role="textbox"], [role="menuitem"]';

type Mode = 'space' | 'pointer';

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
  const [listening, setListening] = useState<Mode | null>(null);
  const [heard, setHeard] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listener = useRef<Listener | null>(null);
  const typing = useRef({ on: false, timer: 0 });
  const voice = useRef({ base: '', heard: '', space: false });
  const ended = room.phase === 'ended';
  const anchored = !ended && selection.length > 0;

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
    if (!body || sending || ended) return;
    const shapeIds = useRoom.getState().selection;
    const anchor = shapeIds.length ? { streamId: room.main_stream_id, shapeIds } : undefined;
    setSending(true);
    setError('');
    setTyping(false);
    api.ask(room.id, anchor ? { text: body, anchor } : { text: body })
      .then(() => {
        setText((t) => (t.trim() === body ? '' : t));
        if (anchor) useRoom.setState({ selection: [] });
      })
      .catch((err) => { setText((t) => t || body); setError(errorText(err)); })
      .finally(() => setSending(false));
  };

  const onHeard = (finalText: string) => {
    const said = (finalText || voice.current.heard).trim();
    setListening(null);
    setHeard('');
    setTyping(false);
    if (!said) {
      setError('Nothing was heard. Allow the microphone for this page, then hold Space while you speak.');
      return;
    }
    const base = voice.current.base.trim();
    if (base) {
      setText(`${base} ${said}`.slice(0, MAX));
      inputRef.current?.focus();
    } else {
      setText(said.slice(0, MAX));
      submit(said.slice(0, MAX));
    }
  };

  const startListening = (mode: Mode) => {
    if (!sttSupported || ended || listener.current?.active) return;
    listener.current ??= new Listener();
    voice.current.base = text;
    voice.current.heard = '';
    setError('');
    setHeard('');
    setListening(mode);
    setTyping(true);
    try {
      listener.current.start(navigator.language || 'en-US', (t) => { voice.current.heard = t; setHeard(t); }, (t) => actions.current.onHeard(t));
    } catch (err) {
      setListening(null);
      setTyping(false);
      setError((err as Error).message);
    }
  };
  const stopListening = () => listener.current?.stop();

  // global Space handlers read the latest render through this ref
  const actions = useRef({ startListening, stopListening, onHeard });
  actions.current = { startListening, stopListening, onHeard };

  useEffect(() => {
    if (!sttSupported) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(SPACE_OWNERS)) return;
      e.preventDefault();
      if (e.repeat || voice.current.space) return;
      voice.current.space = true;
      actions.current.startListening('space');
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !voice.current.space) return;
      e.preventDefault();
      voice.current.space = false;
      actions.current.stopListening();
    };
    const blur = () => {
      if (!voice.current.space) return;
      voice.current.space = false;
      actions.current.stopListening();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => () => {
    listener.current?.stop();
    window.clearTimeout(typing.current.timer);
    if (typing.current.on) conn?.track({ typing: false });
  }, [conn]);

  useEffect(() => { if (ended) listener.current?.stop(); }, [ended]);

  const shown = listening ? [voice.current.base.trim(), heard].filter(Boolean).join(' ') : text;
  const placeholder = ended ? 'Class has ended. Questions are closed.'
    : listening ? 'Listening. Speak now.'
    : anchored ? 'Ask about the selected shapes'
    : sttSupported ? 'Ask anything. Hold Space to talk.' : 'Ask anything';
  const canSend = !!text.trim() && !sending && !ended && !listening;
  const release = listening === 'space' ? 'Release Space' : 'Release';

  return (
    <form className={`askbar${listening ? ' listening' : ''}`} onSubmit={(e) => { e.preventDefault(); submit(text); }} aria-busy={sending}>
      {listening ? (
        <p className="ask-slip ask-listening hinge-in" role="status">
          <Mic size={14} strokeWidth={2.25} aria-hidden />
          <span>Listening. {release} to {voice.current.base.trim() ? 'add it to your question' : 'send'}.</span>
        </p>
      ) : error ? (
        <div className="ask-slip errata hinge-in" role="alert">
          <span className="grow">{error}</span>
          <button type="button" className="ask-dismiss" onClick={() => setError('')} aria-label="Dismiss this message"><X size={14} strokeWidth={2.25} /></button>
        </div>
      ) : null}

      {anchored && (
        <span className="ask-anchor step-in">
          <Pin size={14} strokeWidth={2.25} aria-hidden />
          <span>Pinned to <span className="mono">{selection.length}</span> {selection.length === 1 ? 'shape' : 'shapes'}</span>
          <button type="button" className="ask-dismiss" onClick={() => useRoom.setState({ selection: [] })}
            aria-label="Clear the selection and ask about the whole lesson" title="Clear the selection">
            <X size={14} strokeWidth={2.25} />
          </button>
        </span>
      )}

      {sttSupported ? (
        <button type="button" className="btn icon-btn ask-mic" aria-pressed={!!listening} disabled={ended}
          aria-label={listening ? 'Stop listening' : 'Hold to talk'} title="Hold to talk, or hold Space"
          onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); startListening('pointer'); }}
          onPointerUp={() => { if (!voice.current.space) stopListening(); }}
          onPointerCancel={() => { if (!voice.current.space) stopListening(); }}
          onClick={(e) => { if (e.detail === 0) { if (listening) stopListening(); else startListening('pointer'); } }}
          onContextMenu={(e) => e.preventDefault()}>
          <Mic size={16} strokeWidth={2.25} />
        </button>
      ) : (
        <span className="ask-nomic" tabIndex={0} role="img"
          aria-label="Voice questions need Chrome, Edge or Safari. Type your question instead."
          title="Voice questions need Chrome, Edge or Safari. Type your question instead.">
          <MicOff size={16} strokeWidth={2.25} />
        </span>
      )}

      <span className="ask-field">
        <input ref={inputRef} className="input" placeholder={placeholder} value={shown} maxLength={MAX}
          readOnly={!!listening} disabled={ended} aria-label={anchored ? 'Ask about the selected shapes' : 'Ask a question'}
          aria-invalid={!!error || undefined}
          onChange={(e) => { setText(e.target.value); setError(''); if (e.target.value) bumpTyping(); else setTyping(false); }}
          onBlur={() => setTyping(false)} />
        {text.length > MAX - 100 && !listening && <span className="ask-count mono" aria-live="polite">{text.length}/{MAX}</span>}
      </span>

      <button type="submit" className={`btn${canSend ? ' primary' : ''}`} disabled={!canSend}>
        {sending ? 'Sending' : anchored ? 'Ask about this' : 'Ask'}
      </button>
    </form>
  );
}

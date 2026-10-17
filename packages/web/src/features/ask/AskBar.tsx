// A2 (Dev A): the ask bar. Starting point: type and send. A2 adds hold-Space push to talk,
// "Ask about this" for board selections (useRoom selection), and typing presence.
import { useState } from 'react';
import { useRoom } from '../../room/store';
import { api } from '../../lib/api';

export function AskBar() {
  const room = useRoom((s) => s.room)!;
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    api.ask(room.id, { text: text.trim() }).then(() => { setText(''); setError(''); }).catch((err) => setError((err as Error).message));
  };
  return (
    <form className="askbar" onSubmit={send}>
      <input className="input" placeholder="Ask anything" value={text} maxLength={500} onChange={(e) => setText(e.target.value)}
        disabled={room.phase === 'ended'} aria-label="Ask a question" />
      <button className="btn" disabled={!text.trim()}>Ask</button>
      {error && <span className="error-text" role="alert">{error}</span>}
    </form>
  );
}

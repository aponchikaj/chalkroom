// Bottom bar: ready chips, I'm ready, host controls, ask box.
// TODO(frontend): "Ask about this" for board selections,
// typing presence, the thread entry point (⋯ thread).
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowUpRight, Check } from 'lucide-react';
import { selectActiveMembers, selectIsHost, selectReadyIds, useRoom } from '../room/store';
import { api } from '../lib/api';

export function ReadyBar() {
  const room = useRoom((s) => s.room)!;
  const me = useRoom((s) => s.me)!;
  const isHost = useRoom(selectIsHost);
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const ready = useRoom(useShallow((s) => [...selectReadyIds(s)]));
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const act = (p: Promise<unknown>) => p.then(() => setError('')).catch((e) => setError((e as Error).message));
  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    act(api.ask(room.id, { text: text.trim() }).then(() => setText('')));
  };

  return (
    <footer className="controlbar">
      {room.phase === 'check' && (
        <div className="ready-chips" aria-label="Ready">
          {members.map((m) => {
            const inThread = !!presence[m.user_id]?.threadId;
            const ok = ready.includes(m.user_id);
            return <span key={m.user_id} className={`chip ${ok ? 'ready' : ''}`}>{inThread ? <ArrowUpRight size={14} aria-label="in a thread" /> : ok ? <Check size={14} aria-label="ready" /> : null}{m.display_name}</span>;
          })}
          <button className="btn primary" disabled={ready.includes(me)} onClick={() => act(api.ready(room.id, { segment: room.segment }))}>
            {ready.includes(me) ? <><Check size={16} aria-hidden /> Ready</> : "I'm ready"}
          </button>
        </div>
      )}
      {isHost && (
        <div className="row host-controls" aria-label="Host controls">
          {room.phase === 'lobby' && <button className="btn primary" onClick={() => act(api.start(room.id))}>Start class</button>}
          {room.phase === 'check' && <button className="btn" onClick={() => act(api.host(room.id, { action: 'skip' }))}>Skip</button>}
          {room.phase === 'check' && (room.gate_held
            ? <button className="btn" onClick={() => act(api.host(room.id, { action: 'resume' }))}>Resume</button>
            : <button className="btn" onClick={() => act(api.host(room.id, { action: 'hold' }))}>Hold</button>)}
          {room.phase !== 'lobby' && room.phase !== 'ended' && <>
            <button className="btn" onClick={() => act(api.host(room.id, { action: 'slower' }))}>Slower</button>
            <button className="btn danger" onClick={() => act(api.host(room.id, { action: 'end' }))}>End</button>
          </>}
        </div>
      )}
      <form className="ask" onSubmit={ask}>
        <input className="input" placeholder="Ask anything…" value={text} maxLength={500} onChange={(e) => setText(e.target.value)}
          disabled={room.phase === 'ended'} aria-label="Ask a question" />
        <button className="btn" disabled={!text.trim()}>Ask</button>
      </form>
      {error && <span className="error-text" role="alert">{error}</span>}
    </footer>
  );
}

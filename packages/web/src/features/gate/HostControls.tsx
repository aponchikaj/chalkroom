// A4 (Dev A): host overrides. Start, Skip, Hold/Resume, Slower, End. The host rarely needs
// these (UX rule 5), so they stay quiet. Starting point only; A4 owns the design.
import { useState } from 'react';
import { selectIsHost, useRoom } from '../../room/store';
import { api } from '../../lib/api';

export function HostControls() {
  const room = useRoom((s) => s.room)!;
  const isHost = useRoom(selectIsHost);
  const [error, setError] = useState('');
  if (!isHost) return null;
  const act = (p: Promise<unknown>) => p.then(() => setError('')).catch((e) => setError((e as Error).message));
  return (
    <div className="host-controls" aria-label="Host controls">
      {room.phase === 'lobby' && <button className="btn primary" onClick={() => act(api.start(room.id))}>Start class</button>}
      {room.phase === 'check' && <button className="btn" onClick={() => act(api.host(room.id, { action: 'skip' }))}>Skip</button>}
      {room.phase === 'check' && (room.gate_held
        ? <button className="btn" onClick={() => act(api.host(room.id, { action: 'resume' }))}>Resume</button>
        : <button className="btn" onClick={() => act(api.host(room.id, { action: 'hold' }))}>Hold</button>)}
      {room.phase !== 'lobby' && room.phase !== 'ended' && <>
        <button className="btn" onClick={() => act(api.host(room.id, { action: 'slower' }))}>Slower</button>
        <button className="btn danger" onClick={() => act(api.host(room.id, { action: 'end' }))}>End</button>
      </>}
      {error && <span className="error-text" role="alert">{error}</span>}
    </div>
  );
}

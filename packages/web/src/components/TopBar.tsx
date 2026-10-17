import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { mainPlayer, selectActiveMembers, useRoom } from '../room/store';
import { usePlayer } from '../board/Board';
import { navigate } from '../lib/router';

const PHASE_LABEL = { lobby: 'Lobby', teaching: 'Teaching', check: 'Check + ready', qa: 'Q&A', ended: 'Ended' } as const;

export function TopBar() {
  const room = useRoom((s) => s.room)!;
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const here = members.filter((m) => presence[m.user_id]).length;
  const host = members.find((m) => m.user_id === room.host_id);
  usePlayer(mainPlayer);
  const muted = mainPlayer.speaker.settings.muted;

  return (
    <header className="topbar">
      <button className="brand btn ghost" onClick={() => navigate('/')} aria-label="Home">Chalkroom Live</button>
      <div className="crumbs"><b>{room.title}</b></div>
      <span className="spacer" />
      <span className="seats" aria-label={`${here} of ${room.seats} here`}>
        {Array.from({ length: room.seats }, (_, i) => <i key={i} className={i < here ? 'on' : ''} />)}
        <span>{here}/{room.seats} here</span>
      </span>
      {host && <span className="muted">host: {host.display_name}</span>}
      <span className={`chip phase-${room.phase}`}>{PHASE_LABEL[room.phase]}</span>
      <GateTimer deadline={room.gate_deadline} held={room.gate_held} />
      <button className="btn ghost icon-btn" aria-pressed={muted} aria-label={muted ? 'Unmute tutor voice' : 'Mute tutor voice'}
        onClick={() => mainPlayer.setMuted(!muted)}>{muted ? '🔇' : '🔊'}</button>
    </header>
  );
}

function GateTimer({ deadline, held }: { deadline: string | null; held: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [deadline]);
  if (held) return <span className="timer">gate on hold</span>;
  if (!deadline) return null;
  const s = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
  return <span className="timer" title="The class moves on when everyone is ready or the timer runs out">⏱ {s}s</span>;
}

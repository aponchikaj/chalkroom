// The running head of the manual: product, the class title at display scale, where the class
// is (phase in words), the gate timer and the voice switch.
import { useEffect, useState } from 'react';
import { Timer, Volume2, VolumeX } from 'lucide-react';
import { mainPlayer, useRoom } from '../../room/store';
import { usePlayer } from '../../board/Board';
import { navigate } from '../../lib/router';
import { Stamp } from '../../ui/Stamp';

const PHASE = { lobby: 'Lobby', teaching: 'Teaching', check: 'Check and ready', qa: 'Questions and answers', ended: 'Class ended' } as const;

export function Masthead() {
  const room = useRoom((s) => s.room)!;
  usePlayer(mainPlayer);
  const muted = mainPlayer.speaker.settings.muted;
  const seg = room.lesson_plan?.segments[room.segment];

  return (
    <header className="masthead">
      <button className="masthead-brand" onClick={() => navigate('/')} aria-label="Chalkroom Live home">Chalkroom Live</button>
      <div className="masthead-title">
        <h1>{room.title}</h1>
        {seg && room.phase !== 'lobby' && room.phase !== 'ended' && (
          <p className="masthead-sub">Segment {room.segment + 1} of {room.lesson_plan!.segments.length}: {seg.title}</p>
        )}
      </div>
      <div className="masthead-state">
        <Stamp tone={room.phase === 'ended' ? 'muted' : 'section'}>{PHASE[room.phase]}</Stamp>
        <GateTimer deadline={room.gate_deadline} held={room.gate_held} />
        <button className="btn ghost icon-btn" aria-pressed={muted} aria-label={muted ? 'Turn tutor voice on' : 'Turn tutor voice off'}
          onClick={() => mainPlayer.setMuted(!muted)}>{muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}</button>
      </div>
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
  if (held) return <Stamp tone="ink">Gate on hold</Stamp>;
  if (!deadline) return null;
  const s = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
  return (
    <span className="gate-timer mono" title="The class moves on when everyone is ready or this runs out">
      <Timer size={14} aria-hidden /> {s}s
    </span>
  );
}

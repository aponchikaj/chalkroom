// A7 (Dev A) + lane C: the running head of the notebook: product, the class title hand-lettered
// on the cover (Gochi Hand), where the class is (phase in words), the host's class clock, the
// voice switch and who is signed in (account menu: Account, Your classes, Log out). The gate
// timer lives in the ready strip. On phones it also carries the people as a row of small
// punches (the binding column is hidden there).
import { Volume2, VolumeX } from 'lucide-react';
import { mainPlayer, selectIsHost, useRoom } from '../../room/store';
import { usePlayer } from '../../board/Board';
import { navigate } from '../../lib/router';
import { Stamp } from '../../ui/Stamp';
import { Binding } from './Binding';
import { AccountMenu } from '../../screens/auth/AccountMenu';
import { HostClock } from '../gate/HostControls';

const PHASE = { lobby: 'Lobby', teaching: 'Teaching', check: 'Check and ready', qa: 'Questions and answers', ended: 'Class ended' } as const;

export function Masthead() {
  const room = useRoom((s) => s.room)!;
  usePlayer(mainPlayer);
  const muted = mainPlayer.speaker.settings.muted;
  const seg = room.lesson_plan?.segments[room.segment];
  const isHost = useRoom(selectIsHost);
  const live = room.phase !== 'lobby' && room.phase !== 'ended';

  return (
    <header className="masthead">
      <button className="masthead-brand" onClick={() => navigate('/')} aria-label="Chalkroom Live home">Chalkroom Live</button>
      <div className="masthead-title">
        <h1 className="display-hand">{room.title}</h1>
        {/* always one line, so the title block keeps its height when the class starts */}
        <p className="masthead-sub">
          {seg && live ? `Part ${room.segment + 1} of ${room.lesson_plan!.segments.length}: ${seg.title}`
            : room.phase === 'lobby' ? 'Before class: the lesson starts when the host presses Start'
            : room.phase === 'ended' ? 'Class over' : 'The tutor is writing the lesson plan'}
        </p>
      </div>
      <div className="masthead-state">
        <Stamp tone={room.phase === 'ended' ? 'muted' : 'ink'}>{PHASE[room.phase]}</Stamp>
        {isHost && live && <span className="masthead-clock"><HostClock /></span>}
        <button className="btn ghost masthead-voice" aria-label={muted ? 'Tutor voice is off. Turn it on' : 'Tutor voice is on. Turn it off'}
          title={muted ? 'Turn tutor voice on' : 'Turn tutor voice off'} onClick={() => mainPlayer.setMuted(!muted)}>
          {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
          <span className="masthead-voice-word">{muted ? 'Voice off' : 'Voice on'}</span>
        </button>
        <AccountMenu />
      </div>
      <div className="masthead-people"><Binding orientation="horizontal" /></div>
    </header>
  );
}

// A7 (Dev A) + lane C: the running head of the notebook: product, the class title hand-lettered
// on the cover (Gochi Hand), where the class is (phase in words), the host's class clock, the
// voice switch and who is signed in (account menu: Account, Your classes, Log out). The gate
// timer lives in the ready strip. On phones it also carries the people as a row of small
// punches (the binding column is hidden there).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { api } from '../../lib/api';
import { mainPlayer, selectIsHost, useRoom } from '../../room/store';
import { usePlayer } from '../../board/Board';
import { navigate } from '../../lib/router';
import { Stamp } from '../../ui/Stamp';
import { Binding } from './Binding';
import { AccountMenu } from '../../screens/auth/AccountMenu';
import { HostClock } from '../gate/HostControls';
import { PhoneMenu, usePhone, type PhoneGroup } from '../../ui/PhoneNav';
import { sectionHue, sectionInk } from '../../ui/section';

const PHASE = { lobby: 'Lobby', teaching: 'Teaching', check: 'Check and ready', qa: 'Questions and answers', ended: 'Class ended' } as const;
/** phones: the same phase in one short word, so the class title keeps its room */
const PHASE_SHORT = { lobby: 'Lobby', teaching: 'Teach', check: 'Check', qa: 'Q&A', ended: 'Over' } as const;

export function Masthead() {
  const room = useRoom((s) => s.room)!;
  usePlayer(mainPlayer);
  const muted = mainPlayer.speaker.settings.muted;
  const seg = room.lesson_plan?.segments[room.segment];
  const isHost = useRoom(selectIsHost);
  const live = room.phase !== 'lobby' && room.phase !== 'ended';
  const phone = usePhone();
  const toggleVoice = () => mainPlayer.setMuted(!mainPlayer.speaker.settings.muted);
  // phones: Leave class frees the seat (as the recap's Leave does); during a live lesson the
  // first tap asks, a second tap within a few seconds leaves
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    if (!confirmLeave) return;
    const t = window.setTimeout(() => setConfirmLeave(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmLeave]);
  const leave = () => { void api.leave(room.id).catch(() => { /* leaving either way */ }).finally(() => navigate('/#classes')); };

  // phones: the burger holds this class (voice, leave), its lesson parts and the account
  const segments = room.lesson_plan?.segments ?? [];
  const classGroups: PhoneGroup[] = [
    { title: 'This class', rows: [
      { key: 'voice', label: 'Tutor voice', run: toggleVoice, keepOpen: true, pressed: !muted, page: muted ? 'Off' : 'On' },
      live && !confirmLeave
        ? { key: 'leave', label: 'Leave class', run: () => setConfirmLeave(true), keepOpen: true }
        : { key: 'leave', label: live ? 'Tap again to leave' : 'Leave class', run: leave },
    ] },
    ...(segments.length ? [{ title: 'Lesson', outline: true, rows: segments.map((sg, i) => ({
      key: `part:${i}`, label: sg.title, hue: sectionHue(i), onHue: sectionInk(i), page: <span className="mono">{i + 1}</span>,
      current: live && i === room.segment, done: room.phase === 'ended' || (room.phase !== 'lobby' && i < room.segment),
    })) }] : []),
  ];

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
        <Stamp tone={room.phase === 'ended' ? 'muted' : 'ink'}>{phone ? <><span aria-hidden>{PHASE_SHORT[room.phase]}</span><span className="sr-only">{PHASE[room.phase]}</span></> : PHASE[room.phase]}</Stamp>
        {isHost && live && <span className="masthead-clock"><HostClock /></span>}
        <button className="btn ghost masthead-voice" aria-label={muted ? 'Tutor voice is off. Turn it on' : 'Tutor voice is on. Turn it off'}
          title={muted ? 'Turn tutor voice on' : 'Turn tutor voice off'} onClick={toggleVoice}>
          {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
          <span className="masthead-voice-word">{muted ? 'Voice off' : 'Voice on'}</span>
        </button>
        {/* during a live lesson the burger holds only this class: no one-tap way out to another page */}
        {phone ? <PhoneMenu groups={classGroups} shared={!live} foot={!live} /> : <AccountMenu />}
        {/* the drawer's Leave row asks for a second tap by changing its label in place; say so out
            loud. On body, so it is heard while the drawer makes the app root inert */}
        {phone && live && createPortal(
          <span className="sr-only" role="status" aria-live="polite">{confirmLeave ? 'Tap again to leave the class.' : ''}</span>,
          document.body,
        )}
      </div>
      <div className="masthead-people"><Binding orientation="horizontal" /></div>
    </header>
  );
}

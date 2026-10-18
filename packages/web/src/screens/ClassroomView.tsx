// The classroom as an open notebook (pure view of the room store + connection context).
//
//   masthead ........................................................................
//   binding | board leaf (lesson, overlays, captions)        | rail (Q / notes) | tabs
//   control bar: ready strip | host controls | activities | lost / got it
//                ask bar ..........................................................
//
// Every region below is owned by one feature (docs/TASKS.md A1-A7); this file only places them,
// and decides when the class voice may speak on this device (ClassVoice). It never reads the
// board selection itself, so selecting a shape re-renders the board, not the whole classroom.
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { StreamEvent } from '@chalk/schema';
import { mainPlayer, useRoom } from '../room/store';
import { Board, PageStrip, usePlayer } from '../board/Board';
import { sectionHue } from '../ui/section';
import { TabRail } from '../ui/TabRail';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Masthead } from '../features/people/Masthead';
import { Binding } from '../features/people/Binding';
import { RailPanel } from '../features/rail/RailPanel';
import { AskBar } from '../features/ask/AskBar';
import { ReadyStrip } from '../features/gate/ReadyStrip';
import { HostControls } from '../features/gate/HostControls';
import { QABanner } from '../features/gate/QABanner';
import { narrationPaused } from '../features/gate/hostApi';
import { PausedCue } from '../features/gate/PausedCue';
import { CheckCard } from '../features/check/CheckCard';
import { useCurrentCheckId, useHostAnswerPolling } from '../features/check/hostAnswers';
import { ThreadLeaf } from '../features/thread/ThreadLeaf';
import { CatchUpCard } from '../features/thread/CatchUpCard';
import { LobbyLeaf } from '../features/lobby/LobbyLeaf';
import { Recap } from '../features/notes/Recap';
import { ReactionsLayer } from '../features/layers/ReactionsLayer';
import { LaserLayer } from '../features/layers/LaserLayer';
import { LostGotIt } from '../features/layers/LostGotIt';
import { claimVoice } from '../lib/voiceFront';
import { ActivityLayer } from '../features/activities/ActivityLayer';
import { ActivityControls } from '../features/activities/ActivityControls';
import { usePhone, useVisualViewport } from '../features/phone';
import '../ui/ui.css';
import './classroom.css';

export function ClassroomView() {
  const roomId = useRoom((s) => s.room!.id);
  return (
    <ErrorBoundary what="The classroom" resetKeys={[roomId]}>
      <Classroom />
    </ErrorBoundary>
  );
}

function Classroom() {
  const room = useRoom((s) => s.room)!;
  const conn = useRoom((s) => s.conn);
  const openThreadId = useRoom((s) => s.openThreadId);
  const checkOpen = useRoom((s) => !!s.check);
  const ended = room.phase === 'ended';
  const lobby = room.phase === 'lobby';
  // phones: the class is pinned to what the soft keyboard leaves of the screen (classroom.css)
  const phone = usePhone();
  const keyboard = useVisualViewport(phone);

  if (conn === 'removed') {
    return (
      <div className="removed" role="alert">
        <div className="leaf col">
          <h2>You were removed from this class</h2>
          <p className="muted">The host removed you, so this class is closed to you. You can start a class of your own.</p>
          <a className="btn primary" href="/">Back home</a>
        </div>
      </div>
    );
  }

  return (
    <div className={`live phase-${room.phase}${keyboard ? ' kb-open' : ''}`} style={{ ['--section' as string]: sectionHue(room.segment) }}>
      <ClassVoice />
      <HostAnswerSync />
      <Masthead />
      {conn === 'reconnecting' && <div className="banner warn" role="status">Reconnecting. The board will catch up on its own.</div>}
      {conn === 'error' && <div className="banner error" role="alert">Lost the class connection. Reload the page to rejoin.</div>}
      <div className="live-tabs-h"><SegmentLine /></div>
      <div className={`live-body ${openThreadId ? 'with-thread' : ''}`}>
        <div className="live-binding"><Binding /></div>
        <main className={`stage ${openThreadId || checkOpen ? 'in-focus-elsewhere' : ''}`}>
          <div className="stage-head"><QABanner /></div>
          <div className="board-wrap">
            <ErrorBoundary what="The board" resetKeys={[room.segment]}>
              <MainBoard hint={lobby ? '' : 'The tutor is preparing the first figure'} />
              <ReactionsLayer />
              <LaserLayer />
              <ActivityLayer />
            </ErrorBoundary>
            {lobby && <LobbyLeaf />}
            {ended && <Recap />}
          </div>
          {!ended && <Captions />}
          {/* the slips dock under the captions, never over the figure: a catch-up first, then the
              check (folded until the catch-up is read: classroom.css) */}
          <div className="stage-dock">
            <CatchUpCard />
            <ErrorBoundary what="The check" compact><CheckCard /></ErrorBoundary>
          </div>
          <PageStrip player={mainPlayer} />
        </main>
        <div className="live-rail"><RailPanel /></div>
        <div className="live-tabs-v"><TabRail /></div>
        {openThreadId && <div className="thread-layer"><ThreadLeaf threadId={openThreadId} /></div>}
      </div>
      {!ended && (
        <footer className="controlbar">
          {/* two rows on wide screens from the lobby on (the class row, then the ask box), so the
              bar never changes height when the ready gate opens; one flowing bar on phones */}
          <div className="controlbar-class">
            <ReadyStrip />
            <HostControls />
            <ActivityControls />
            <LostGotIt />
          </div>
          <AskBar />
        </footer>
      )}
    </div>
  );
}

/** The main board. Reads the selection here so a click on a shape re-renders only the board.
 *  On phones it follows the pen at a readable size (the layers map through useBoardViewCamera). */
function MainBoard({ hint }: { hint: string }) {
  const selection = useRoom(useShallow((s) => s.selection));
  return <Board player={mainPlayer} follow selection={selection} onSelect={(ids) => useRoom.setState({ selection: ids })} emptyHint={hint} />;
}

/**
 * When the class voice speaks on this device. Silent while this person reads a side thread,
 * before the class starts (nothing is taught in the lobby, so nothing may be heard there), after
 * it ends (the board jumps to its end instead of narrating under the recap), and while another
 * Chalkroom tab or window is the one the person is using (lib/voiceFront.ts; lib/speaker.ts
 * checks that, and the page, before every sentence). The host's Pause holds the board and the
 * voice on every device until Resume.
 */
function ClassVoice() {
  const openThreadId = useRoom((s) => s.openThreadId);
  const phase = useRoom((s) => s.room?.phase);
  const paused = useRoom((s) => s.room?.phase !== 'ended' && narrationPaused(s.mainEvents));
  const ended = phase === 'ended';
  const quiet = !!openThreadId || ended || phase === 'lobby';

  // opening the class is choosing to listen to it
  useEffect(() => { claimVoice(); }, []);
  useEffect(() => {
    mainPlayer.setSilenced(quiet);
    if (ended) mainPlayer.interrupt();
  }, [quiet, ended]);
  useEffect(() => {
    if (paused) mainPlayer.pause(); else mainPlayer.resume();
  }, [paused]);
  useEffect(() => () => { mainPlayer.setSilenced(false); mainPlayer.resume(); }, []);
  return null;
}

/** Host only: keeps the who-answered list of the current check fresh. */
function HostAnswerSync() {
  const { id, open } = useCurrentCheckId();
  useHostAnswerPolling(id, open);
  return null;
}

/** Phones: the lesson as one thin progress line (the divider tabs need a wide screen). Always
 *  present, so the page does not jump when the class starts. */
function SegmentLine() {
  const plan = useRoom((s) => s.room?.lesson_plan ?? null);
  const segment = useRoom((s) => s.room?.segment ?? 0);
  const phase = useRoom((s) => s.room?.phase);
  const startedSeg = useRoom((s) => {
    for (let i = s.mainEvents.length - 1; i >= 0; i--) {
      const e = s.mainEvents[i];
      if (e.kind === 'segment_start') return (e as StreamEvent<'segment_start'>).data.segment;
    }
    return -1;
  });
  const live = !!plan && phase !== 'lobby';
  const n = plan?.segments.length ?? 0;
  const done = phase === 'ended' ? n : segment;
  const label = !live ? 'The lesson starts when the host starts the class'
    : phase === 'ended' ? `Class over: all ${n} parts done` : `Part ${segment + 1} of ${n}: ${plan!.segments[segment]?.title ?? ''}`;
  return (
    <div className="segline" role="img" aria-label={label} title={label}>
      {live ? plan!.segments.map((_, i) => (
        <span key={i} style={{ ['--hue' as string]: sectionHue(i) }}
          className={`segline-part${i < done ? ' is-done' : i === segment && phase !== 'ended' ? ` is-now${startedSeg === i ? ' is-started' : ''}` : ''}`} />
      )) : <span className="segline-part" />}
    </div>
  );
}

function Captions() {
  usePlayer(mainPlayer);
  const paused = useRoom((s) => narrationPaused(s.mainEvents));
  return (
    <div className="captions" aria-live="polite">
      {paused ? <PausedCue /> : mainPlayer.caption || <span className="faint">{mainPlayer.busy ? '' : 'Captions appear here while the tutor speaks.'}</span>}
    </div>
  );
}

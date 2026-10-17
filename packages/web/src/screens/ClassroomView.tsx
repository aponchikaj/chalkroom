// The classroom as an open manual (pure view of the room store + connection context).
//
//   masthead ........................................................................
//   binding | board leaf (lesson, overlays, captions)        | rail (Q / notes) | tabs
//   control bar: ready strip | host controls | ask bar ...............................
//
// Every region below is owned by one feature (docs/TASKS.md A1-A7); this file only places them.
import { useShallow } from 'zustand/react/shallow';
import { mainPlayer, useRoom } from '../room/store';
import { Board, PageStrip, usePlayer } from '../board/Board';
import { sectionHue } from '../ui/section';
import { TabRail } from '../ui/TabRail';
import { Masthead } from '../features/people/Masthead';
import { Binding } from '../features/people/Binding';
import { RailPanel } from '../features/rail/RailPanel';
import { AskBar } from '../features/ask/AskBar';
import { ReadyStrip } from '../features/gate/ReadyStrip';
import { HostControls } from '../features/gate/HostControls';
import { QABanner } from '../features/gate/QABanner';
import { CheckCard } from '../features/check/CheckCard';
import { ThreadLeaf } from '../features/thread/ThreadLeaf';
import { CatchUpCard } from '../features/thread/CatchUpCard';
import { LobbyLeaf } from '../features/lobby/LobbyLeaf';
import { Recap } from '../features/notes/Recap';
import { ReactionsLayer } from '../features/layers/ReactionsLayer';
import { LaserLayer } from '../features/layers/LaserLayer';
import '../ui/ui.css';
import './classroom.css';

export function ClassroomView() {
  const room = useRoom((s) => s.room)!;
  const conn = useRoom((s) => s.conn);
  const openThreadId = useRoom((s) => s.openThreadId);
  const selection = useRoom(useShallow((s) => s.selection));
  const checkOpen = useRoom((s) => !!s.check);

  return (
    <div className={`live phase-${room.phase}`} style={{ ['--section' as string]: sectionHue(room.segment) }}>
      <Masthead />
      {conn === 'reconnecting' && <div className="banner warn" role="status">Reconnecting. The board will catch up on its own.</div>}
      {conn === 'error' && <div className="banner error" role="alert">Lost the class connection. Reload the page to rejoin.</div>}
      <div className="live-tabs-h"><TabRail orientation="horizontal" /></div>
      <div className={`live-body ${openThreadId ? 'with-thread' : ''}`}>
        <div className="live-binding"><Binding /></div>
        <main className={`stage ${openThreadId || checkOpen ? 'in-focus-elsewhere' : ''}`}>
          <div className="board-wrap">
            <Board player={mainPlayer} selection={selection} onSelect={(ids) => useRoom.setState({ selection: ids })}
              emptyHint={room.phase === 'lobby' ? '' : 'The tutor is preparing the first figure'} />
            <ReactionsLayer />
            <LaserLayer />
            {room.phase === 'lobby' && <LobbyLeaf />}
            {room.phase === 'ended' && <Recap />}
            <QABanner />
            <CheckCard />
            <CatchUpCard />
          </div>
          <Captions />
          <PageStrip player={mainPlayer} />
        </main>
        <div className="live-rail"><RailPanel /></div>
        <div className="live-tabs-v"><TabRail /></div>
        {openThreadId && <div className="thread-layer"><ThreadLeaf threadId={openThreadId} /></div>}
      </div>
      <footer className="controlbar">
        <ReadyStrip />
        <HostControls />
        <AskBar />
      </footer>
    </div>
  );
}

function Captions() {
  usePlayer(mainPlayer);
  return (
    <div className="captions" aria-live="polite">
      {mainPlayer.caption || <span className="faint">{mainPlayer.busy ? '' : 'Captions appear here while the tutor speaks.'}</span>}
    </div>
  );
}

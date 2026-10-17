// The classroom (design doc, "Screens"): people + plan | shared board | questions + notes,
// with the ready bar along the bottom. Thread drawer slides in from the right (TODO).
import { useEffect, useState } from 'react';
import { connectRoom, Superseded, type RoomConnection } from '../room/connection';
import { RoomConnContext } from '../room/context';
import { mainPlayer, useRoom } from '../room/store';
import type { Profile } from '../lib/profile';
import { Board, PageStrip, usePlayer } from '../board/Board';
import { TopBar } from '../components/TopBar';
import { PeoplePanel, PlanPanel } from '../components/SidePanels';
import { ReadyBar } from '../components/ReadyBar';
import { CheckCard } from '../components/CheckCard';
import { LobbyOverlay, EndedOverlay } from '../components/Overlays';
import { RightPanel } from '../components/RightPanel';
import { ThreadDrawer } from '../components/ThreadDrawer';

export function Classroom({ roomId, profile }: { roomId: string; profile: Profile }) {
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const [fatal, setFatal] = useState('');
  const phase = useRoom((s) => s.room?.phase);
  const connState = useRoom((s) => s.conn);
  const openThreadId = useRoom((s) => s.openThreadId);

  useEffect(() => {
    let c: RoomConnection | null = null;
    let alive = true;
    connectRoom(roomId, profile)
      .then((x) => { if (alive) { c = x; setConn(x); } else x.close(); })
      .catch((e) => { if (!(e instanceof Superseded)) setFatal((e as Error).message); });
    return () => { alive = false; c?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, profile.name, profile.color]);

  if (fatal) return <div className="empty">Could not open the classroom: {fatal}</div>;
  if (!conn || !phase) return <div className="empty">Joining the class…</div>;

  return (
    <RoomConnContext.Provider value={conn}>
      <div className="live">
        <TopBar />
        {connState === 'reconnecting' && <div className="banner warn">Reconnecting… the board will catch up automatically.</div>}
        <div className={`live-body ${openThreadId ? 'with-thread' : ''}`}>
          <aside className="sidebar scroll">
            <PeoplePanel />
            <PlanPanel />
          </aside>
          <section className="stage">
            <div className="board-wrap">
              <Board player={mainPlayer} emptyHint={phase === 'lobby' ? '' : 'The tutor is getting ready…'} />
              {phase === 'lobby' && <LobbyOverlay />}
              {phase === 'ended' && <EndedOverlay />}
              <CheckCard />
            </div>
            <Captions />
            <PageStrip player={mainPlayer} />
          </section>
          {openThreadId ? <ThreadDrawer threadId={openThreadId} /> : <RightPanel />}
        </div>
        <ReadyBar />
      </div>
    </RoomConnContext.Provider>
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

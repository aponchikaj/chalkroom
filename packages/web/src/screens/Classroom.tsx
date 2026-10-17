// Joins the room (realtime + snapshot) and renders the classroom view.
import { useEffect, useState } from 'react';
import { connectRoom, Superseded, type RoomConnection } from '../room/connection';
import { RoomConnContext } from '../room/context';
import { useRoom } from '../room/store';
import type { Profile } from '../lib/profile';
import { ClassroomView } from './ClassroomView';

export function Classroom({ roomId, profile }: { roomId: string; profile: Profile }) {
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const [fatal, setFatal] = useState('');
  const ready = useRoom((s) => !!s.room);

  useEffect(() => {
    let c: RoomConnection | null = null;
    let alive = true;
    connectRoom(roomId, profile)
      .then((x) => { if (alive) { c = x; setConn(x); } else x.close(); })
      .catch((e) => { if (!(e instanceof Superseded)) setFatal((e as Error).message); });
    return () => { alive = false; c?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, profile.name, profile.color]);

  if (fatal) return <div className="empty" role="alert">Could not open the classroom ({fatal}). Reload the page to try again.</div>;
  if (!conn || !ready) return <div className="empty">Opening the class</div>;
  return <RoomConnContext.Provider value={conn}><ClassroomView /></RoomConnContext.Provider>;
}

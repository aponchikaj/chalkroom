import { createContext, useContext } from 'react';
import type { RoomConnection } from './connection';

export const RoomConnContext = createContext<RoomConnection | null>(null);

/** The live room connection (presence, laser, raw events). Only inside <Classroom>. */
export function useRoomConn(): RoomConnection | null {
  return useContext(RoomConnContext);
}

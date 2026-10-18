// Lane C: who answered the current check, for the host only (GET /rooms/:id/host/checks/:id/answers).
// Polled while the check is open, read once more when it closes. Learners never load this.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { HostCheckAnswer } from '@chalk/schema';
import { selectIsHost, useRoom } from '../../room/store';
import { hostApi } from '../gate/hostApi';

interface HostAnswers {
  /** check id -> answers, as last read */
  byCheck: Record<string, HostCheckAnswer[]>;
  failed: Record<string, boolean>;
}

export const useHostAnswers = create<HostAnswers>(() => ({ byCheck: {}, failed: {} }));

/** The check this class is on: open, or the last one closed. */
export function useCurrentCheckId(): { id: string | null; open: boolean } {
  const open = useRoom((s) => s.check?.checkId ?? null);
  const last = useRoom((s) => {
    for (let i = s.mainEvents.length - 1; i >= 0; i--) if (s.mainEvents[i].kind === 'check') return (s.mainEvents[i].data as { checkId: string }).checkId;
    return null;
  });
  return { id: open ?? last, open: !!open };
}

/** Keep the host's copy of a check's answers fresh. Call once (the check card does). */
export function useHostAnswerPolling(checkId: string | null, open: boolean) {
  const isHost = useRoom(selectIsHost);
  const roomId = useRoom((s) => s.room?.id);
  useEffect(() => {
    if (!isHost || !roomId || !checkId) return;
    let alive = true;
    const read = () => hostApi.checkAnswers(roomId, checkId)
      .then((rows) => { if (alive) useHostAnswers.setState((s) => ({ byCheck: { ...s.byCheck, [checkId]: rows }, failed: { ...s.failed, [checkId]: false } })); })
      .catch(() => { if (alive) useHostAnswers.setState((s) => ({ failed: { ...s.failed, [checkId]: true } })); });
    void read();
    if (!open) return () => { alive = false; };
    const t = window.setInterval(read, 4000);
    return () => { alive = false; window.clearInterval(t); };
  }, [isHost, roomId, checkId, open]);
}

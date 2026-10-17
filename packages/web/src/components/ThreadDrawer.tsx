// Thread drawer (design doc, "Threads in detail"). Placeholder until docs/TASKS.md A3 / B4.
// Plan: a second Player (silent mini board) fed by a StreamSync on the thread's stream_id
// via useRoomConn().onEvent; chat from `chat` events; main board as live picture-in-picture;
// "Back to class" → api.closeThread → catch-up card from thread.left_main_seq.
import { useRoom } from '../room/store';

export function ThreadDrawer({ threadId }: { threadId: string }) {
  const thread = useRoom((s) => s.threads[threadId]);
  return (
    <aside className="rightbar thread-drawer">
      <div className="row" style={{ padding: 10 }}>
        <b className="grow">Thread: {thread?.topic ?? '…'}</b>
        <button className="btn small" onClick={() => useRoom.setState({ openThreadId: null })}>Back to class</button>
      </div>
      <p className="empty">Threads are not built yet.</p>
    </aside>
  );
}

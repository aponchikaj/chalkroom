// A3 (Dev A): the thread as an acetate leaf hinged over the board (design doc, "Threads in
// detail"). Placeholder; A3 owns it. Plan: a second Player fed by a StreamSync on the thread's
// stream_id (fetchEvents + useRoomConn().onEvent); chat from `chat` events; the main board stays
// visible through the acetate; Back to class -> api.closeThread -> CatchUpCard.
import { useRoom } from '../../room/store';

export function ThreadLeaf({ threadId }: { threadId: string }) {
  const thread = useRoom((s) => s.threads[threadId]);
  return (
    <section className="thread-leaf acetate punched hinge-in" aria-label="Thread">
      <div className="row" style={{ padding: '12px 14px 12px 34px' }}>
        <h2 className="grow">{thread?.topic ?? 'Thread'}</h2>
        <button className="btn small" onClick={() => useRoom.setState({ openThreadId: null })}>Back to class</button>
      </div>
    </section>
  );
}

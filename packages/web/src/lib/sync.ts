// Client sync for one stream (design doc, "Client sync algorithm"):
//   1. subscribe first and buffer live events;
//   2. fetch the snapshot (all events after lastSeq);
//   3. replay it instantly, then apply buffered events with seq > N in order;
//   4. on a gap (seq jumps) fetch events after lastSeq;
//   5. on reconnect call resync().
// Applying is idempotent by seq, so duplicates from overlap are dropped.
import type { StreamEvent } from '@chalk/schema';

export type FetchAfter = (afterSeq: number) => Promise<StreamEvent[]>;
export type Apply = (ev: StreamEvent, live: boolean) => void;

export class StreamSync {
  lastSeq = 0;
  private buffering = true;
  private buffer: StreamEvent[] = [];
  /** out-of-order events waiting for the gap before them to fill */
  private pending = new Map<number, StreamEvent>();
  private filling: Promise<void> | null = null;

  constructor(readonly streamId: string, private fetchAfter: FetchAfter, private apply: Apply) {}

  /** Live event from the realtime channel. */
  receive(ev: StreamEvent) {
    if (ev.stream_id !== this.streamId) return;
    if (this.buffering) this.buffer.push(ev);
    else this.ingest(ev, true);
  }

  /** Steps 2–3: snapshot, then drain the buffer. Call once after subscribing. */
  async start() {
    this.buffering = true;
    const snapshot = await this.fetchAfter(this.lastSeq);
    for (const ev of snapshot) this.ingest(ev, false);
    this.buffering = false;
    const buffered = this.buffer.sort((a, b) => a.seq - b.seq);
    this.buffer = [];
    for (const ev of buffered) this.ingest(ev, true);
  }

  /** Step 5: after a reconnect, fetch whatever was missed while offline. */
  async resync() {
    const missed = await this.fetchAfter(this.lastSeq);
    for (const ev of missed) this.ingest(ev, true);
  }

  private ingest(ev: StreamEvent, live: boolean) {
    if (ev.seq <= this.lastSeq) return;
    if (ev.seq > this.lastSeq + 1) {
      this.pending.set(ev.seq, ev);
      void this.fillGap();
      return;
    }
    this.lastSeq = ev.seq;
    this.apply(ev, live);
    const next = this.pending.get(this.lastSeq + 1);
    if (next) {
      this.pending.delete(next.seq);
      this.ingest(next, live);
    }
  }

  private fillGap() {
    if (!this.filling) {
      this.filling = (async () => {
        try {
          const missing = await this.fetchAfter(this.lastSeq);
          for (const ev of missing) this.ingest(ev, true);
        } finally {
          this.filling = null;
        }
      })();
    }
    return this.filling;
  }
}

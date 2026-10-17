// Lane L: drives a board Player through a finished class's events, one event at a time, so the
// progress (player.playedSeq) is exact, pause holds mid-figure, and a seek fast-forwards: every
// event before the target is applied at once, then playback goes on from there.
import type { StreamEvent } from '@chalk/schema';
import type { Player } from '../../lib/player';

export class ReplayDriver {
  playing = false;
  /** index of the next event to feed */
  private pos = 0;
  private gen = 0;
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(readonly player: Player, readonly events: StreamEvent[]) {}

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private emit() { this.version++; for (const l of this.listeners) l(); }

  get firstSeq() { return this.events[0]?.seq ?? 0; }
  get lastSeq() { return this.events[this.events.length - 1]?.seq ?? 0; }
  /** seq of the event playing now (the last one fed) */
  get atSeq() { return this.pos > 0 ? this.events[this.pos - 1].seq : 0; }
  /** everything fed and drawn */
  get done() { return this.pos >= this.events.length && !this.player.busy; }

  /** Jump: apply every event before `seq` instantly, then (optionally) play on from it. */
  seek(seq: number, play = this.playing) {
    this.gen++;
    this.player.reset();
    let i = 0;
    // playing on: the target event itself plays; paused: the board shows it already drawn
    while (i < this.events.length && (this.events[i].seq < seq || (!play && this.events[i].seq === seq))) this.player.push(this.events[i++], false);
    this.pos = i;
    if (play) this.play(); else { this.playing = false; this.player.pause(); this.emit(); }
  }

  play() {
    if (this.done) { this.seek(this.firstSeq, true); return; }
    this.playing = true;
    this.player.resume();
    this.emit();
    void this.loop(this.gen);
  }

  pause() {
    this.playing = false;
    this.player.pause();
    this.emit();
  }

  stop() {
    this.gen++;
    this.playing = false;
    this.player.reset();
    this.player.speaker.stop();
  }

  private async loop(g: number) {
    // one loop per generation: a second play() while this one waits is a no-op
    if (this.running === g) return;
    this.running = g;
    try {
      while (g === this.gen && this.pos < this.events.length) {
        if (!this.playing) return;
        if (this.player.busy) { await this.idle(); continue; }
        this.player.push(this.events[this.pos++], true);
        this.emit();
      }
      if (g === this.gen) {
        await this.idle();
        if (g === this.gen) { this.playing = false; this.emit(); }
      }
    } finally {
      if (this.running === g) this.running = -1;
    }
  }
  private running = -1;

  /** Resolves when the player has drawn and said everything queued. */
  private idle() {
    return new Promise<void>((resolve) => {
      if (!this.player.busy) { resolve(); return; }
      const off = this.player.subscribe(() => { if (!this.player.busy) { off(); resolve(); } });
    });
  }
}

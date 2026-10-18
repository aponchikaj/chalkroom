// The server voice's work list: one sentence at a time per process, in order, each key once.
// Sentences a learner is waiting for (POST /tts) go to the front; narration made ahead of the
// class (pre-generation) goes to the back. A key already in storage is skipped.
import { ttsKey } from './tts-key';

export interface Clip { pcm: Float32Array; rate: number; ms: number }

export interface TtsDeps {
  /** make one sentence (the model) */
  synth(text: string): Promise<Clip>;
  /** the file for this key is in storage already */
  exists(key: string): Promise<boolean>;
  /** store one finished sentence */
  store(key: string, clip: Clip): Promise<void>;
  log?(line: string): void;
  warn?(line: string): void;
}

export type TtsState = 'ready' | 'pending' | 'unknown';

/** most sentences waiting at once; beyond it nothing more is made ahead of time */
const MAX_JOBS = 2000;
/** keys remembered as stored (a set, cleared when it grows past this) */
const MAX_DONE = 20000;

export class TtsQueue {
  private jobs: { key: string; text: string }[] = [];
  /** queued or being made */
  private pending = new Set<string>();
  private done = new Set<string>();
  private running = false;
  private idle: (() => void)[] = [];
  /** totals for the running real-time factor */
  readonly stats = { sentences: 0, synthMs: 0, audioS: 0, skipped: 0, failed: 0 };

  constructor(private deps: TtsDeps) {}

  state(key: string): TtsState {
    return this.pending.has(key) ? 'pending' : this.done.has(key) ? 'ready' : 'unknown';
  }

  /** The file is known to be in storage (a lookup found it). */
  markReady(key: string) { this.remember(key); }

  /** Queue one sentence; `front` when a learner waits for it. Returns its key. */
  enqueue(text: string, front = false): string {
    const key = ttsKey(text);
    // a key made before is queued again all the same: the job checks storage first (one HEAD), so a
    // file removed from the bucket is made again instead of being reported ready forever
    if (this.pending.has(key)) {
      // already waiting: a learner needs it now, so move it up (unless it is being made)
      if (front) {
        const i = this.jobs.findIndex((j) => j.key === key);
        if (i > 0) this.jobs.unshift(...this.jobs.splice(i, 1));
      }
      return key;
    }
    // far behind: make no more ahead of time (a learner's request still goes in)
    if (!front && this.jobs.length >= MAX_JOBS) return key;
    this.pending.add(key);
    if (front) this.jobs.unshift({ key, text }); else this.jobs.push({ key, text });
    void this.run();
    return key;
  }

  /** Sentences waiting, the one being made included. */
  get size() { return this.pending.size; }

  /** Resolves when the queue is empty (tests). */
  drained(): Promise<void> {
    if (!this.running && !this.jobs.length) return Promise.resolve();
    return new Promise((r) => this.idle.push(r));
  }

  private remember(key: string) {
    if (this.done.size >= MAX_DONE) this.done.clear();
    this.done.add(key);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length) {
        const job = this.jobs.shift()!;
        try {
          if (await this.deps.exists(job.key)) { this.stats.skipped++; this.remember(job.key); continue; }
          this.done.delete(job.key);
          const clip = await this.deps.synth(job.text);
          await this.deps.store(job.key, clip);
          this.remember(job.key);
          const audioS = clip.pcm.length / clip.rate;
          const s = this.stats;
          s.sentences++; s.synthMs += clip.ms; s.audioS += audioS;
          this.deps.log?.(`sentence ${job.key.slice(0, 8)}: ${clip.ms} ms for ${audioS.toFixed(2)} s of audio (RTF ${(clip.ms / 1000 / audioS).toFixed(2)}; running RTF ${(s.synthMs / 1000 / s.audioS).toFixed(2)} over ${s.sentences}; ${this.jobs.length} waiting)`);
        } catch (e) {
          this.stats.failed++;
          this.deps.warn?.(`sentence ${job.key.slice(0, 8)} failed: ${(e as Error).message}`);
        } finally {
          this.pending.delete(job.key);
        }
        // let requests and the conductors run between sentences
        await new Promise((r) => setImmediate(r));
      }
    } finally {
      this.running = false;
      for (const r of this.idle.splice(0)) r();
    }
  }
}

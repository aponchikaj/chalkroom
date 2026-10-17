// Board player: turns stream events into an animated, narrated timeline on this device.
// Board state comes from the same pure reducer the API uses (@chalk/board), so any stream
// can be replayed from its events. Playback is local; the class re-syncs at ready gates.
import type { BoardStep, StreamEvent } from '@chalk/schema';
import { applyStep, emptyBoard, splitSentences, type BoardState, type Effect } from '@chalk/board';
import { Speaker } from './speaker';

type Item =
  | { k: 'step'; step: BoardStep }
  | { k: 'say'; text: string }
  | { k: 'mark'; seq: number };

export interface ActiveEffect { key: number; kind: 'highlight' | 'underline' | 'circle' | 'pulse'; ids: string[]; until: number }

const DRAW_MS: Record<string, number> = {
  box: 650, circle: 650, arrow: 560, sticky: 600, formula: 750, code: 900, table: 900,
  chart: 1100, image: 500, path: 600, frame: 600, group: 200,
};

export class Player {
  state: BoardState = emptyBoard();
  /** ids drawn with animation, mapped to their draw duration in ms */
  animate = new Map<string, number>();
  effects: ActiveEffect[] = [];
  caption = '';
  paused = false;
  /** playback speed multiplier (2 = "Replay at 2×") */
  pace = 1;
  /** the learner's voice speed preference; spoken rate = pace x voiceRate */
  voiceRate = 1;
  /** page the learner is looking at; null follows the tutor */
  viewPage: number | null = null;
  /** highest seq whose steps have finished playing on this device */
  playedSeq = 0;
  readonly speaker: Speaker;

  private queue: Item[] = [];
  private running = false;
  private listeners = new Set<() => void>();
  private version = 0;
  private fxKey = 0;
  private wakeResume: (() => void) | null = null;
  /** bumped on reset/interrupt so in-flight narration stops */
  private gen = 0;

  constructor(opts: { silent?: boolean } = {}) {
    this.speaker = new Speaker();
    if (opts.silent) this.speaker.settings.muted = true;
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private emit() { this.version++; for (const l of this.listeners) l(); }

  get busy() { return this.running || this.queue.length > 0; }

  reset() {
    this.gen++;
    this.speaker.stop();
    this.queue = [];
    this.state = emptyBoard();
    this.animate.clear();
    this.effects = [];
    this.caption = '';
    this.viewPage = null;
    this.playedSeq = 0;
    this.emit();
  }

  /** Feed one stream event. live=false applies it instantly (history, late join, catch-up). */
  push(ev: Pick<StreamEvent, 'seq' | 'kind' | 'data'>, live: boolean) {
    const items = itemsFor(ev);
    if (!live || !items.length) {
      for (const it of items) this.applyInstant(it);
      this.playedSeq = Math.max(this.playedSeq, ev.seq);
      this.emit();
      return;
    }
    this.queue.push(...items, { k: 'mark', seq: ev.seq });
    void this.run();
  }

  /** Stop narration and jump to the end of everything queued. */
  interrupt() {
    this.gen++;
    this.speaker.stop();
    const rest = this.queue;
    this.queue = [];
    for (const it of rest) this.applyInstant(it);
    this.caption = '';
    this.emit();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.speaker.stop();
    this.emit();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.emit();
    this.wakeResume?.();
    void this.run();
  }

  setMuted(muted: boolean) {
    this.speaker.settings.muted = muted;
    if (muted) this.speaker.stop();
    this.emit();
  }

  /** Silence the voice while the person is elsewhere (their side thread, the recap); the board
   *  keeps playing at reading pace. Separate from setMuted, which is their own preference. */
  setSilenced(on: boolean) {
    if (this.speaker.silenced === on) return;
    this.speaker.silenced = on;
    if (on) this.speaker.stop();
    this.emit();
  }

  setViewPage(i: number | null) { this.viewPage = i; this.emit(); }

  private applyInstant(it: Item) {
    if (it.k === 'step') {
      const r = applyStep(this.state, it.step);
      this.state = r.state;
      if (r.effect.kind === 'draw' || r.effect.kind === 'update') this.animate.delete(r.effect.id);
    } else if (it.k === 'mark') this.playedSeq = Math.max(this.playedSeq, it.seq);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        if (this.paused) await new Promise<void>((r) => { this.wakeResume = r; });
        this.wakeResume = null;
        const it = this.queue.shift()!;
        await this.play(it);
      }
    } finally {
      this.running = false;
      this.caption = '';
      this.emit();
    }
  }

  private sleep(ms: number) { return new Promise((r) => setTimeout(r, ms / this.pace)); }

  private async play(it: Item) {
    if (it.k === 'mark') { this.playedSeq = Math.max(this.playedSeq, it.seq); this.emit(); return; }
    if (it.k === 'say') {
      const sentences = splitSentences(it.text);
      const g = this.gen;
      for (let i = 0; i < sentences.length; i++) {
        this.caption = sentences[i];
        this.emit();
        if (sentences[i + 1]) this.speaker.prefetch(sentences[i + 1]);
        this.speaker.settings.rate = this.pace * this.voiceRate;
        await this.speaker.speak(sentences[i]);
        if (g !== this.gen) return;
        // paused mid-sentence: replay that sentence on resume
        if (this.paused) { this.queue.unshift({ k: 'say', text: sentences.slice(i).join(' ') }); return; }
      }
      return;
    }
    const before = this.state.current;
    const r = applyStep(this.state, it.step);
    this.state = r.state;
    if (this.state.current !== before) this.viewPage = null;
    const e: Effect = r.effect;
    if (e.kind === 'draw' || e.kind === 'update') {
      const shape = this.state.pages[this.state.current].shapes[e.id];
      const ms = (DRAW_MS[shape?.kind ?? ''] ?? Math.min(1200, Math.max(380, (shape?.text?.length ?? 10) * 22))) / this.pace;
      this.animate.set(e.id, ms);
      this.emit();
      await this.sleep(ms * this.pace + 120);
      // drawn: later re-renders (page switches) show it without animating again
      this.animate.delete(e.id);
    } else if (e.kind === 'highlight' || e.kind === 'underline' || e.kind === 'circle' || e.kind === 'pulse') {
      const fx: ActiveEffect = { key: ++this.fxKey, kind: e.kind, ids: e.ids, until: Date.now() + e.seconds * 1000 };
      this.effects = [...this.effects, fx];
      this.emit();
      setTimeout(() => { this.effects = this.effects.filter((x) => x !== fx); this.emit(); }, e.seconds * 1000);
      await this.sleep(e.kind === 'pulse' ? 700 : 450);
    } else if (e.kind === 'say') {
      await this.play({ k: 'say', text: e.text });
    } else if (e.kind === 'wait') {
      await this.sleep(e.seconds * 1000);
    } else {
      this.emit();
      await this.sleep(e.kind === 'camera' ? 800 : e.kind === 'error' ? 0 : 250);
    }
  }
}

function itemsFor(ev: Pick<StreamEvent, 'kind' | 'data'>): Item[] {
  const steps = (s: BoardStep[]) => s.map((x): Item => ('say' in x ? { k: 'say', text: x.say } : { k: 'step', step: x }));
  switch (ev.kind) {
    case 'board': {
      const d = ev.data as StreamEvent<'board'>['data'];
      return [...(d.page ? [{ k: 'step', step: { page: { title: d.page } } } as Item] : []), ...steps(d.steps)];
    }
    case 'answer_cluster': return steps((ev.data as StreamEvent<'answer_cluster'>['data']).steps);
    default: return [];
  }
}

/** Narration text of an event, for transcripts, catch-up and notes. */
export function narrationOf(ev: Pick<StreamEvent, 'kind' | 'data'>): string | null {
  if (ev.kind !== 'board' && ev.kind !== 'answer_cluster') return null;
  const says = (ev.data as { steps: BoardStep[] }).steps.flatMap((s) => ('say' in s ? [s.say] : []));
  return says.length ? says.join(' ') : null;
}

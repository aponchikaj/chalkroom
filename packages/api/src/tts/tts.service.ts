// Server voice (TTS=kokoro): every sentence the main board player speaks is made once, here,
// with Kokoro-82M (voice af_heart) and stored in the public Storage bucket `tts` as <key>.wav.
// Every learner plays the same file, phones included, and nothing downloads to the browser.
// Narration is made ahead of the class: each main-stream event with spoken lines is queued the
// moment it is appended (EventsService.onAppend), so the audio exists before learners reach it.
// The model runs in a worker thread (kokoro.worker.mjs): onnxruntime-node is synchronous and would
// otherwise freeze the API for each sentence.
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { spokenSentences } from '@chalk/board';
import { TTS_SAMPLE, TTS_VOICE, type StreamEvent, type TtsEngine } from '@chalk/schema';
import { config } from '../config';
import { EventsService } from '../core/events.service';
import { SupabaseService } from '../core/supabase.service';
import { encodeWav } from './tts-key';
import { TtsQueue, type Clip } from './tts-queue';

export const TTS_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const BUCKET = 'tts';

export const ttsUrl = (key: string) => `${config.supabaseUrl}/storage/v1/object/public/${BUCKET}/${key}.wav`;

@Injectable()
export class TtsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Tts');
  readonly queue: TtsQueue;
  private worker: ChildProcess | null = null;
  private ready: Promise<void> | null = null;
  private failed = false;
  private nextId = 0;
  private calls = new Map<number, { resolve: (c: Clip) => void; reject: (e: Error) => void }>();
  /** stream id -> it is a room's main stream (only the main board player speaks) */
  private mainStreams = new Map<string, Promise<boolean>>();
  private unlisten: (() => void) | null = null;

  constructor(private supa: SupabaseService, private events: EventsService) {
    this.queue = new TtsQueue({
      synth: (text) => this.synth(text),
      exists: (key) => this.exists(key),
      store: (key, clip) => this.store(key, clip),
      log: (l) => this.log.log(l),
      warn: (l) => this.log.warn(l),
    });
  }

  /** what /health reports: 'off' when TTS is not set or the model could not load */
  get engine(): TtsEngine { return config.tts.engine === 'kokoro' && !this.failed ? 'kokoro' : 'off'; }

  onModuleInit() {
    if (config.tts.engine !== 'kokoro') return;
    this.unlisten = this.events.onAppend((ev) => this.pregenerate(ev));
    // load in the background, so boot is not held up; then the sample sentence warms the model
    // (its first run is about 2x slower) and makes "Hear it" instant
    void this.load().then(() => this.queue.enqueue(TTS_SAMPLE), () => {});
  }

  async onModuleDestroy() {
    this.unlisten?.();
    this.worker?.kill();
  }

  /** Queue every sentence of a main-stream event the board player will speak, in order. */
  pregenerate(ev: Pick<StreamEvent, 'stream_id' | 'kind' | 'data'>) {
    const sentences = spokenSentences(ev);
    if (!sentences.length || this.engine === 'off') return;
    void this.isMain(ev.stream_id).then((main) => {
      if (main) for (const s of sentences) this.queue.enqueue(s);
    }).catch(() => {});
  }

  /** The file is in storage (a HEAD on its public URL). */
  async exists(key: string): Promise<boolean> {
    const r = await fetch(ttsUrl(key), { method: 'HEAD' }).catch(() => null);
    return !!r?.ok;
  }

  private async store(key: string, clip: Clip) {
    const r = await this.supa.db.storage.from(BUCKET).upload(`${key}.wav`, encodeWav(clip.pcm, clip.rate), {
      contentType: 'audio/wav', cacheControl: '31536000', upsert: true,
    });
    if (r.error) throw new Error(`store: ${r.error.message}`);
  }

  private isMain(streamId: string): Promise<boolean> {
    let hit = this.mainStreams.get(streamId);
    if (!hit) {
      hit = Promise.resolve(this.supa.db.from('streams').select('kind').eq('id', streamId).maybeSingle())
        .then((r) => r.data?.kind === 'main');
      if (this.mainStreams.size > 5000) this.mainStreams.clear();
      this.mainStreams.set(streamId, hit);
      hit.catch(() => this.mainStreams.delete(streamId));
    }
    return hit;
  }

  /** Start the worker and load the model (once; again after a crash). */
  private load(): Promise<void> {
    if (this.ready) return this.ready;
    // a child process, not a worker thread: kokoro-js loads its own onnxruntime-node, and on Linux
    // one process cannot hold two versions of the native library (the embeddings load the other)
    const w = fork(fileURLToPath(new URL('./kokoro.worker.mjs', import.meta.url)), [], { serialization: 'advanced', stdio: ['ignore', 'inherit', 'inherit', 'ipc'], execArgv: [] });
    this.worker = w;
    const t0 = Date.now();
    this.ready = new Promise<void>((resolve, reject) => {
      const onInit = (m: { type?: string; ms?: number; error?: string }) => {
        if (m.type === 'ready') {
          this.log.log(`${TTS_MODEL} (${config.tts.dtype}${config.tts.threads ? `, ${config.tts.threads} threads` : ''}) ready in ${Date.now() - t0} ms`);
          resolve();
        } else if (m.type === 'failed') {
          this.failed = true;
          this.log.warn(`voice model not loaded, the web uses the system voice: ${m.error}`);
          reject(new Error(m.error));
        }
      };
      w.on('message', (m: { type?: string; id?: number; pcm?: Float32Array; rate?: number; ms?: number; error?: string }) => {
        if (m.type) return onInit(m);
        const call = this.calls.get(m.id!);
        if (!call) return;
        this.calls.delete(m.id!);
        if (m.error) call.reject(new Error(m.error));
        else call.resolve({ pcm: m.pcm!, rate: m.rate!, ms: m.ms! });
      });
      const gone = (why: string) => {
        if (this.worker !== w) return;
        this.worker = null;
        this.ready = null;
        for (const c of this.calls.values()) c.reject(new Error(why));
        this.calls.clear();
        reject(new Error(why));
      };
      w.on('error', (e) => { this.log.warn(`voice worker failed: ${e.message}`); gone(e.message); });
      w.on('exit', (code) => gone(`voice worker exited (${code})`));
    });
    w.send({ type: 'init', model: TTS_MODEL, dtype: config.tts.dtype, cacheDir: config.tts.cacheDir, threads: config.tts.threads });
    return this.ready;
  }

  private async synth(text: string): Promise<Clip> {
    if (this.failed) throw new Error('the voice model did not load');
    await this.load();
    const id = ++this.nextId;
    return new Promise<Clip>((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
      this.worker!.send({ id, text, voice: TTS_VOICE });
    });
  }
}

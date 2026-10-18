/// <reference lib="webworker" />
// The Natural voice: Kokoro-82M (Apache 2.0) running in this worker, off the main thread.
// The page talks to it only through lib/kokoro.ts. Messages:
//   in:  { type: 'load', device, dtype }  { type: 'speak', id, text, voice, speed }
//   out: { type: 'progress', loaded, total }  { type: 'ready', device }
//        { type: 'audio', id, audio, rate, ms }  (ms: time the model took)  { type: 'error', id?, message }
import { KokoroTTS } from 'kokoro-js';

export type WorkerIn =
  | { type: 'load'; device: 'webgpu' | 'wasm'; dtype: 'fp32' | 'q8' }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number };
export type WorkerOut =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'audio'; id: number; audio: Float32Array; rate: number; ms: number }
  | { type: 'error'; id?: number; message: string };

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerOut, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

let tts: Promise<KokoroTTS> | null = null;
// one sentence at a time: the model is not re-entrant, and order matters for prefetch
let chain: Promise<unknown> = Promise.resolve();

function load(device: 'webgpu' | 'wasm', dtype: 'fp32' | 'q8') {
  if (tts) return tts;
  // every file reports its own bytes; add them up into one bar
  const files = new Map<string, { loaded: number; total: number }>();
  tts = KokoroTTS.from_pretrained(MODEL, {
    device,
    dtype,
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      post({ type: 'progress', loaded, total });
    },
  });
  tts.then(() => post({ type: 'ready', device }), (e: Error) => { tts = null; post({ type: 'error', message: e?.message ?? String(e) }); });
  return tts;
}

scope.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if (m.type === 'load') { void load(m.device, m.dtype).catch(() => {}); return; }
  if (m.type === 'speak') {
    chain = chain.then(async () => {
      try {
        if (!tts) throw new Error('voice not loaded');
        const model = await tts;
        const t0 = performance.now();
        const out = await model.generate(m.text, { voice: m.voice as 'af_heart', speed: m.speed });
        const audio = out.audio as Float32Array;
        post({ type: 'audio', id: m.id, audio, rate: out.sampling_rate, ms: performance.now() - t0 }, [audio.buffer]);
      } catch (err) {
        post({ type: 'error', id: m.id, message: (err as Error)?.message ?? String(err) });
      }
    });
  }
};

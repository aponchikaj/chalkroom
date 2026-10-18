// The Natural voice on this device: an opt-in download of Kokoro-82M that runs in a Web
// Worker (lib/kokoro.worker.ts). Nothing downloads until the person presses Download on the
// account page; after that, classes load it from the browser cache in the background and the
// speaker uses it once it is ready (the system voice covers any sentence it is not ready for).
// The worker and the model never touch the main bundle: the worker is its own chunk.
import { create } from 'zustand';
import type { WorkerIn, WorkerOut } from './kokoro.worker';

const READY_KEY = 'chalkroom.voice.natural';
const RTF_KEY = 'chalkroom.voice.rtf';
/** the device the voice was downloaded for ('wasm' unless someone set 'webgpu' by hand) */
const DEVICE_KEY = 'chalkroom.voice.device';
/** the model must make speech this much faster than it plays, or a live class outruns it */
const KEEPS_UP_RTF = 0.85;
const VOICE = 'af_heart';
/** browser caches the model and voice files land in (transformers.js and kokoro-js) */
const MODEL_CACHE = 'transformers-cache';
const VOICE_CACHE = 'kokoro-voices';

type Device = 'webgpu' | 'wasm';

export interface NaturalSupport {
  ok: boolean;
  /** why this device keeps the system voice, in plain words */
  reason: string;
  device: Device;
  dtype: 'fp32' | 'q8';
  /** download size in MB, rounded */
  mb: number;
}

/** WASM with the 8-bit model (about 90 MB): it caches reliably and, measured on WebGPU machines,
 *  the 330 MB fp32 WebGPU model is not fast enough to keep up with a class either. WebGPU only
 *  when set by hand in localStorage ('chalkroom.voice.device' = 'webgpu'), for testing. */
function chosenDevice(): Device {
  try { return localStorage.getItem(DEVICE_KEY) === 'webgpu' ? 'webgpu' : 'wasm'; } catch { return 'wasm'; }
}
const modelFile = (device: Device) => (device === 'webgpu' ? /\/onnx\/model\.onnx$/ : /\/onnx\/model_quantized\.onnx$/);

/** Desktop browsers with enough memory and no data saver. */
export function naturalSupport(): NaturalSupport {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & {
    deviceMemory?: number; connection?: { saveData?: boolean };
  };
  const device = chosenDevice();
  const base = { device, dtype: device === 'webgpu' ? 'fp32' as const : 'q8' as const, mb: device === 'webgpu' ? 330 : 90 };
  const no = (reason: string) => ({ ...base, ok: false, reason });
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' || typeof caches === 'undefined') return no('This browser cannot run the Natural voice, so it uses the system voice.');
  const phone = /Android|iPhone|iPad|iPod|Mobi/i.test(nav.userAgent ?? '') || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);
  if (phone) return no('The Natural voice is for computers. Phones and tablets use their own voice.');
  if (nav.connection?.saveData) return no('Data saver is on, so this device keeps the system voice.');
  const mem = nav.deviceMemory ?? ((nav.hardwareConcurrency ?? 4) >= 4 ? 4 : 2);
  if (mem < 4) return no('This computer has too little memory for the Natural voice, so it uses the system voice.');
  return { ...base, ok: true, reason: '' };
}

export type NaturalStatus = 'none' | 'downloading' | 'ready' | 'error';

interface NaturalStore {
  status: NaturalStatus;
  /** 0 to 1 while downloading */
  progress: number;
  error: string;
  /** the model is loaded in this tab's worker and can speak right now */
  live: boolean;
  /** seconds of model time per second of speech on this device, averaged; null before measuring */
  rtf: number | null;
}

const storedReady = () => { try { return localStorage.getItem(READY_KEY) === 'ready'; } catch { return false; } };
const setStoredReady = (on: boolean) => { try { if (on) localStorage.setItem(READY_KEY, 'ready'); else localStorage.removeItem(READY_KEY); } catch { /* storage blocked */ } };

const storedRtf = () => { try { const v = Number(localStorage.getItem(RTF_KEY)); return v > 0 ? v : null; } catch { return null; } };
const setStoredRtf = (v: number | null) => { try { if (v) localStorage.setItem(RTF_KEY, v.toFixed(3)); else localStorage.removeItem(RTF_KEY); } catch { /* storage blocked */ } };

export const useNaturalVoice = create<NaturalStore>(() => ({ status: storedReady() ? 'ready' : 'none', progress: 0, error: '', live: false, rtf: storedRtf() }));

/** The Natural voice was downloaded on this device. */
export const naturalDownloaded = () => useNaturalVoice.getState().status === 'ready';

/** This device makes Natural speech faster than it plays, so a live class can use it. */
export const naturalKeepsUp = (rtf = useNaturalVoice.getState().rtf) => rtf == null || rtf < KEEPS_UP_RTF;

/** Fold one measured sentence into the device's speed (sentences under a second say little). */
function measure(ms: number, seconds: number) {
  if (seconds < 1) return;
  const r = ms / 1000 / seconds;
  const prev = useNaturalVoice.getState().rtf;
  const rtf = prev == null ? r : prev * 0.7 + r * 0.3;
  setStoredRtf(rtf);
  useNaturalVoice.setState({ rtf });
}

/** The model and the voice file are both in the browser cache, so nothing downloads again. */
async function filesKept(device: Device): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  if (!(await caches.has(VOICE_CACHE)) || !(await caches.has(MODEL_CACHE))) return false;
  const c = await caches.open(MODEL_CACHE);
  const want = modelFile(device);
  return (await c.keys()).some((r) => /Kokoro/i.test(r.url) && want.test(new URL(r.url).pathname));
}

// the files can be cleared by the browser behind our back: then this device has no Natural voice
if (storedReady() && typeof caches !== 'undefined') {
  void filesKept(chosenDevice()).then((kept) => {
    if (!kept) { setStoredReady(false); useNaturalVoice.setState({ status: 'none' }); }
  }).catch(() => {});
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (a: { audio: Float32Array; rate: number }) => void; reject: (e: Error) => void }>();
let loaded: Promise<void> | null = null;
let loadDone: { resolve: () => void; reject: (e: Error) => void } | null = null;

function onMessage(e: MessageEvent<WorkerOut>) {
  const m = e.data;
  if (m.type === 'progress') {
    if (useNaturalVoice.getState().status === 'downloading') useNaturalVoice.setState({ progress: m.total ? Math.min(1, m.loaded / m.total) : 0 });
  } else if (m.type === 'ready') {
    useNaturalVoice.setState({ live: true });
    loadDone?.resolve();
  } else if (m.type === 'audio') {
    measure(m.ms, m.audio.length / m.rate);
    pending.get(m.id)?.resolve({ audio: m.audio, rate: m.rate });
    pending.delete(m.id);
  } else if (m.type === 'error') {
    const err = new Error(m.message);
    if (m.id != null) { pending.get(m.id)?.reject(err); pending.delete(m.id); return; }
    loadDone?.reject(err);
  }
}

function killWorker(reason: string) {
  worker?.terminate();
  worker = null;
  loaded = null;
  loadDone = null;
  for (const p of pending.values()) p.reject(new Error(reason));
  pending.clear();
  cache.clear();
  useNaturalVoice.setState({ live: false });
}

/** The chosen device; WebGPU only when the browser hands out an adapter (headless and
 *  blocklisted GPUs do not). */
async function pickDevice(): Promise<Device> {
  if (chosenDevice() === 'wasm') return 'wasm';
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return 'wasm';
  try { return (await gpu.requestAdapter()) ? 'webgpu' : 'wasm'; } catch { return 'wasm'; }
}

/** the device the model actually loaded on in this tab */
let loadedOn: Device = 'wasm';

function startWorker(device: Device): Promise<void> {
  worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module', name: 'natural-voice' });
  worker.onmessage = onMessage;
  const p = new Promise<void>((resolve, reject) => { loadDone = { resolve, reject }; });
  worker.onerror = (e) => { loadDone?.reject(new Error(e.message || 'The voice worker stopped.')); };
  worker.postMessage({ type: 'load', device, dtype: device === 'webgpu' ? 'fp32' : 'q8' } satisfies WorkerIn);
  return p;
}

/** Start the worker and load the model (from the network the first time, then from the cache).
 *  WebGPU first when there is a GPU; if that fails, WASM. */
function load(): Promise<void> {
  if (loaded) return loaded;
  const s = naturalSupport();
  if (!s.ok) return Promise.reject(new Error(s.reason));
  loaded = (async () => {
    const device = await pickDevice();
    try {
      await startWorker(device);
      loadedOn = device;
    } catch (e) {
      if (device === 'wasm') throw e;
      console.warn('Natural voice on WebGPU failed, trying WASM', e);
      worker?.terminate();
      await startWorker('wasm');
      loadedOn = 'wasm';
    }
  })();
  loaded.catch(() => killWorker('voice failed to load'));
  return loaded;
}

// a few sentences ahead and behind; keyed by text and speed
const cache = new Map<string, Promise<{ audio: Float32Array; rate: number }>>();

/** Synthesize one sentence. Starts loading the model if this tab has not yet. */
export function synthesize(text: string, speed: number): Promise<{ audio: Float32Array; rate: number }> {
  const sp = Math.min(2, Math.max(0.5, Math.round(speed * 100) / 100));
  const key = `${sp}|${text}`;
  let p = cache.get(key);
  if (!p) {
    p = load().then(() => new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker!.postMessage({ type: 'speak', id, text, voice: VOICE, speed: sp } satisfies WorkerIn);
    }));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    while (cache.size > 12) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/** Load the voice in the background so the class can use it soon. Never throws. */
export function warmNaturalVoice() {
  if (naturalDownloaded()) void load().catch(() => {});
}

const NOT_KEPT = 'the browser did not keep the voice files';

/** The account page's Download button: fetch the model once, prove it speaks, remember it. */
export async function downloadNaturalVoice(): Promise<void> {
  const s = naturalSupport();
  if (!s.ok) throw new Error(s.reason);
  useNaturalVoice.setState({ status: 'downloading', progress: 0, error: '' });
  try {
    await load();
    await synthesize('Ready.', 1); // fetches the voice file and compiles the model once
    // a sentence of class length tells how fast this device speaks (lib/speaker.ts reads it)
    useNaturalVoice.setState({ rtf: null });
    await synthesize('Your new voice is ready, and it will read every lesson to you.', 1);
    // the browser must have kept the files, or every class would download them again
    if (!(await filesKept(loadedOn).catch(() => false))) {
      throw new Error(NOT_KEPT);
    }
    if (loadedOn === 'wasm') { try { localStorage.removeItem(DEVICE_KEY); } catch { /* storage blocked */ } }
    setStoredReady(true);
    useNaturalVoice.setState({ status: 'ready', progress: 1 });
  } catch (e) {
    killWorker('download failed');
    console.warn('Natural voice download failed', e);
    useNaturalVoice.setState({
      status: 'error', progress: 0,
      error: (e as Error)?.message === NOT_KEPT
        ? 'Your browser would not keep the voice, so it would download again for every class. The system voice stays on. Free some disk space or allow this site to store data, then press Download again.'
        : 'The download stopped before the voice was ready. Check your connection, then press Download again.',
    });
    throw e;
  }
}

/** Remove the voice from this device: stop the worker and clear its cached files. */
export async function removeNaturalVoice(): Promise<void> {
  killWorker('voice removed');
  setStoredReady(false);
  setStoredRtf(null);
  useNaturalVoice.setState({ status: 'none', progress: 0, error: '', rtf: null });
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(VOICE_CACHE);
    const c = await caches.open(MODEL_CACHE);
    for (const req of await c.keys()) if (/Kokoro/i.test(req.url)) await c.delete(req);
  } catch { /* the browser keeps its cache; nothing else to do */ }
}

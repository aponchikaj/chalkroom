// Server voice worker: Kokoro-82M (kokoro-js, ONNX on the CPU) in its own child process. onnxruntime-node
// runs a model synchronously, so on the main thread every sentence (1 to 3 s) would freeze the
// API: requests, room timers and realtime. Plain JavaScript, so it needs no TypeScript loader.
//
//   in:  { type: 'init', model, dtype, cacheDir, threads }   then   { id, text, voice }
//   out: { type: 'ready', ms } | { type: 'failed', error }   and    { id, pcm, rate, ms } | { id, error }
const parentPort = { postMessage: (m) => process.send(m), on: (e, fn) => process.on(e, fn) };
// the API process went away: nothing left to speak for
process.on('disconnect', () => process.exit(0));
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

let tts = null;

async function load({ model, dtype, cacheDir, threads }) {
  // kokoro-js brings its own @huggingface/transformers (v3; the API's embeddings use v4), so set
  // the cache dir and thread count on that copy: the same module file kokoro-js itself imports
  const require = createRequire(import.meta.url);
  const kokoroEntry = require.resolve('kokoro-js');
  const tfEntry = createRequire(kokoroEntry).resolve('@huggingface/transformers').replace(/\.cjs$/, '.mjs');
  const tf = await import(pathToFileURL(tfEntry).href);
  const { KokoroTTS } = await import('kokoro-js');
  tf.env.cacheDir = cacheDir;
  const session_options = threads > 0 ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : {};
  const [m, tok] = await Promise.all([
    tf.StyleTextToSpeech2Model.from_pretrained(model, { dtype, device: 'cpu', session_options }),
    tf.AutoTokenizer.from_pretrained(model),
  ]);
  return new KokoroTTS(m, tok);
}

parentPort.on('message', async (msg) => {
  if (msg.type === 'init') {
    const t0 = performance.now();
    try {
      tts = await load(msg);
      parentPort.postMessage({ type: 'ready', ms: Math.round(performance.now() - t0) });
    } catch (e) {
      parentPort.postMessage({ type: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  const { id, text, voice } = msg;
  try {
    if (!tts) throw new Error('the voice model is not loaded');
    const t0 = performance.now();
    const audio = await tts.generate(text, { voice });
    const pcm = new Float32Array(audio.audio); // a copy of its own, so it can be transferred
    parentPort.postMessage({ id, pcm, rate: audio.sampling_rate, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    parentPort.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
});

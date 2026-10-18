// The server voice's file names and file format. A sentence's key is the SHA-256 of
// ttsKeySource(text) (@chalk/schema); the web computes the same key with crypto.subtle.
import { createHash } from 'node:crypto';
import { TTS_VOICE, ttsKeySource } from '@chalk/schema';

export const ttsKey = (text: string, voice = TTS_VOICE) => createHash('sha256').update(ttsKeySource(text, voice), 'utf8').digest('hex');

/** a key as the routes accept it */
export const TTS_KEY_RE = /^[0-9a-f]{64}$/;

/** Mono float samples (-1..1) to a 16-bit PCM WAV file. */
export function encodeWav(pcm: Float32Array, sampleRate: number): Buffer {
  const bytes = pcm.length * 2;
  const out = Buffer.alloc(44 + bytes);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + bytes, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16); // fmt chunk size
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28); // byte rate
  out.writeUInt16LE(2, 32); // block align
  out.writeUInt16LE(16, 34); // bits per sample
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(bytes, 40);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    out.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return out;
}

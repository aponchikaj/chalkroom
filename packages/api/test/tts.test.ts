import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spokenSentences } from '@chalk/board';
import { ttsKeySource } from '@chalk/schema';
import { encodeWav, ttsKey, TTS_KEY_RE } from '../src/tts/tts-key';
import { TtsQueue, type Clip } from '../src/tts/tts-queue';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('server voice keys', () => {
  it('hashes v1|voice|text with SHA-256 (the web does the same with crypto.subtle)', () => {
    expect(ttsKeySource('Hello there.')).toBe('v1|af_heart|Hello there.');
    expect(ttsKey('Hello there.')).toBe(sha('v1|af_heart|Hello there.'));
    expect(ttsKey('Hello there.')).toMatch(TTS_KEY_RE);
    expect(ttsKey('Hello there.', 'af_bella')).not.toBe(ttsKey('Hello there.'));
    // UTF-8, like TextEncoder in the browser
    expect(ttsKey('Ein Bruch: ½ ist die Hälfte.')).toBe(createHash('sha256').update(Buffer.from('v1|af_heart|Ein Bruch: ½ ist die Hälfte.', 'utf8')).digest('hex'));
  });

  it('writes a 24 kHz mono 16-bit WAV', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5, 2]), 24000);
    expect(wav.length).toBe(44 + 10);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect([0, 1, 2, 3, 4].map((i) => wav.readInt16LE(44 + i * 2))).toEqual([0, 32767, -32768, 16384, 32767]);
  });
});

describe('sentences the server makes ahead of the class', () => {
  it('takes every say line of board and answer_cluster events, split like the player', () => {
    const board = { kind: 'board', data: { page: 'Fractions', steps: [
      { say: 'A fraction is a part of a whole. So one half means one of two equal pieces!' },
      { draw: { id: 'c', kind: 'circle', at: [1, 1] } },
      { say: 'Ok. Watch.' },
    ] } };
    expect(spokenSentences(board)).toEqual([
      'A fraction is a part of a whole.',
      'So one half means one of two equal pieces!',
      'Ok. Watch.',
    ]);
    const cluster = { kind: 'answer_cluster', data: { clusterId: 'x', title: 't', askers: [], steps: [{ say: 'Good question from Gio.' }] } };
    expect(spokenSentences(cluster)).toEqual(['Good question from Gio.']);
  });

  it('ignores events the player does not speak', () => {
    expect(spokenSentences({ kind: 'notice', data: { text: 'The host paused the class.', level: 'info' } })).toEqual([]);
    expect(spokenSentences({ kind: 'chat', data: { role: 'tutor', markdown: 'Hi there.' } })).toEqual([]);
    expect(spokenSentences({ kind: 'board', data: { steps: [{ say: '   ' }] } })).toEqual([]);
  });
});

describe('server voice queue', () => {
  const clip = (text: string): Clip => ({ pcm: new Float32Array(24000 * Math.max(1, text.length / 20)), rate: 24000, ms: 10 });

  it('makes each key once, in order, and skips keys already in storage', async () => {
    const made: string[] = [];
    const stored = new Set<string>([ttsKey('Already there.')]);
    const q = new TtsQueue({
      synth: async (t) => { made.push(t); await new Promise((r) => setTimeout(r, 5)); return clip(t); },
      exists: async (k) => stored.has(k),
      store: async (k) => { stored.add(k); },
    });
    const a = q.enqueue('First sentence here.');
    q.enqueue('Second sentence here.');
    q.enqueue('First sentence here.'); // queued twice: made once
    q.enqueue('Already there.');
    expect(q.state(a)).toBe('pending');
    await q.drained();
    expect(made).toEqual(['First sentence here.', 'Second sentence here.']);
    expect(q.state(a)).toBe('ready');
    expect(q.stats).toMatchObject({ sentences: 2, skipped: 1, failed: 0 });

    q.enqueue('First sentence here.'); // known ready: not made again
    await q.drained();
    expect(made).toHaveLength(2);
  });

  it('puts a sentence a learner waits for first in line', async () => {
    const made: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const q = new TtsQueue({
      synth: async (t) => { made.push(t); if (made.length === 1) await gate; return clip(t); },
      exists: async () => false,
      store: async () => {},
    });
    q.enqueue('one is being made.');
    q.enqueue('two waits.');
    q.enqueue('three waits.');
    q.enqueue('urgent now.', true);
    q.enqueue('three waits.', true); // already queued: moved up
    release();
    await q.drained();
    expect(made).toEqual(['one is being made.', 'three waits.', 'urgent now.', 'two waits.']);
  });

  it('a failed sentence is not ready and can be asked for again', async () => {
    let fail = true;
    const q = new TtsQueue({
      synth: async (t) => { if (fail) throw new Error('model down'); return clip(t); },
      exists: async () => false,
      store: async () => {},
    });
    const k = q.enqueue('This one fails first.');
    await q.drained();
    expect(q.state(k)).toBe('unknown');
    expect(q.stats.failed).toBe(1);
    fail = false;
    q.enqueue('This one fails first.', true);
    await q.drained();
    expect(q.state(k)).toBe('ready');
  });
});

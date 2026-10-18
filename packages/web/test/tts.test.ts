import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { spokenSentences } from '@chalk/board';

// a visible, focused page in Node: just enough DOM for the voice modules
beforeAll(() => {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: () => true, documentElement: { dataset: {} } });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', doc);
});

const events = [
  { seq: 1, kind: 'board', data: { page: 'Fractions', steps: [
    { say: 'Welcome back, everyone. Today we look at fractions: parts of a whole! Ready?' },
    { draw: { id: 'c1', kind: 'circle', at: [2, 2], text: 'one whole' } },
    { say: 'Ok. Watch the circle.' },
    { say: 'Now I split it into four equal parts. Each one is a quarter, written 1/4.' },
  ] } },
  { seq: 2, kind: 'notice', data: { text: 'The host paused the class.', level: 'info' } },
  { seq: 3, kind: 'answer_cluster', data: { clusterId: 'q', title: 'Why equal parts?', askers: [], steps: [
    { say: 'Gio and Mari asked why the parts must be equal. If they are not, a quarter would not mean one of four same-sized pieces.' },
  ] } },
];

describe('server voice sentences', () => {
  it('the API makes exactly the sentences the main board player speaks, in order', async () => {
    vi.resetModules();
    const { Player } = await import('../src/lib/player');
    const p = new Player();
    p.pace = 1000; // draws and waits take no time
    const spoken: string[] = [];
    const sp = p.speaker as unknown as { speak: (t: string) => Promise<void>; prefetch: (t: string) => void };
    sp.speak = async (t) => { spoken.push(t); };
    sp.prefetch = () => {};
    for (const ev of events) p.push(ev as never, true);
    await vi.waitFor(() => expect(p.busy).toBe(false));
    expect(spoken).toEqual(events.flatMap((ev) => spokenSentences(ev)));
    expect(spoken.length).toBeGreaterThan(4);
  });

  it('prefetches the next three sentences, across lines', async () => {
    vi.resetModules();
    const { Player } = await import('../src/lib/player');
    const p = new Player();
    p.pace = 1000;
    const calls: string[] = [];
    const sp = p.speaker as unknown as { speak: (t: string) => Promise<void>; prefetch: (t: string) => void };
    sp.speak = async (t) => { calls.push(`speak ${t}`); };
    sp.prefetch = (t) => { calls.push(`prefetch ${t}`); };
    p.push({ seq: 1, kind: 'board', data: { steps: [{ say: 'The first sentence is long enough here.' }, { say: 'The second sentence is long enough too.' }] } } as never, true);
    await vi.waitFor(() => expect(p.busy).toBe(false));
    expect(calls.slice(0, 2)).toEqual(['speak The first sentence is long enough here.', 'prefetch The second sentence is long enough too.']);
  });

  it('computes the same key as the API (SHA-256 of v1|voice|text)', async () => {
    const { ttsKey } = await import('../src/lib/serverVoice');
    const text = 'Each one is a quarter, written 1/4.';
    expect(await ttsKey(text)).toBe(createHash('sha256').update(`v1|af_heart|${text}`, 'utf8').digest('hex'));
  });
});

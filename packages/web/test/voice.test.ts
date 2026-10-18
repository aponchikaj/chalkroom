import { describe, it, expect, vi, beforeAll } from 'vitest';

// a visible, focused page in Node: just enough DOM for the voice modules
beforeAll(() => {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: () => true, documentElement: { dataset: {} } });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', doc);
});

const tick = () => new Promise((r) => setTimeout(r, 30));

describe('one tutor voice per browser', () => {
  it('a page that only loads voiceFront (no player) silences the class in another tab', async () => {
    vi.resetModules();
    const classTab = await import('../src/lib/voiceFront');
    const { Speaker } = await import('../src/lib/speaker');
    const speaker = new Speaker();
    await tick();
    expect(classTab.ownsVoice()).toBe(true);
    expect(speaker.silent).toBe(false);

    vi.resetModules();
    const loginTab = await import('../src/lib/voiceFront'); // claims on load
    await tick();
    expect(loginTab.ownsVoice()).toBe(true);
    expect(classTab.ownsVoice()).toBe(false);
    expect(speaker.silent).toBe(true);

    classTab.claimVoice(); // the person comes back to the class
    await tick();
    expect(classTab.ownsVoice()).toBe(true);
    expect(loginTab.ownsVoice()).toBe(false);
    expect(speaker.silent).toBe(false);
  });

  it('only class and replay pages speak', async () => {
    const { speaksOn } = await import('../src/lib/voiceFront');
    expect(speaksOn('/r/ABC123')).toBe(true);
    expect(speaksOn('/c/1234/replay')).toBe(true);
    expect(speaksOn('/')).toBe(false);
    expect(speaksOn('/account')).toBe(false);
    expect(speaksOn('/c/1234')).toBe(false);
  });
});

describe('board player narration', () => {
  it('sends the sentence about to play to the voice before prefetching the next, at the same rate', async () => {
    vi.resetModules();
    const { Player } = await import('../src/lib/player');
    const p = new Player();
    p.voiceRate = 1.5;
    const calls: string[] = [];
    const sp = p.speaker as unknown as { settings: { rate: number }; speak: (t: string) => Promise<void>; prefetch: (t: string) => void };
    sp.speak = async (t) => { calls.push(`speak ${sp.settings.rate} ${t}`); };
    sp.prefetch = (t) => { calls.push(`prefetch ${sp.settings.rate} ${t}`); };
    p.push({ seq: 1, kind: 'board', data: { steps: [{ say: 'The first sentence is long enough here. The second one follows it.' }] } } as never, true);
    await vi.waitFor(() => expect(p.busy).toBe(false));
    expect(calls).toEqual([
      'speak 1.5 The first sentence is long enough here.',
      'prefetch 1.5 The second one follows it.',
      'speak 1.5 The second one follows it.',
    ]);
  });
});

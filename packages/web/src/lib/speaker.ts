// Text-to-speech for the tutor. Two voices, chosen per device (Preferences, "Voice on this
// device"): Natural (Kokoro, an opt-in download that runs in a Web Worker, lib/kokoro.ts) and
// System (the browser's Web Speech API). Off reads at caption pace without sound.
// Every speak() resolves when the sentence ends, whatever voice spoke it, so the board player's
// timing never changes. The voice only ever comes out of the page in front of the person:
// never from a hidden tab, never from a tab behind another Chalkroom tab, and never from a
// page that is not a class or a replay.
import { create } from 'zustand';
import { naturalDownloaded, naturalKeepsUp, synthesize, useNaturalVoice, warmNaturalVoice } from './kokoro';
import { audioContext } from './sfx';
import { onVoiceOwner, ownsVoice, speaksOn } from './voiceFront';

export interface VoiceSettings {
  voice: string; // browser voiceURI ('' picks one for the language)
  rate: number; // 0.5 to 4 (pace x the person's speed)
  muted: boolean;
  textOnly: boolean;
  lang: string;
}

// ---------- the device setting: Natural, System or Off ----------

export type VoiceMode = 'natural' | 'system' | 'off';
const MODE_KEY = 'chalkroom.voice.mode';
const storedMode = (): VoiceMode => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'natural' || v === 'off' ? v : 'system';
  } catch { return 'system'; }
};

/** The voice this device uses (a hook for the settings UI). Natural needs the download first. */
export const useVoiceMode = create<{ mode: VoiceMode }>(() => ({ mode: storedMode() }));

export function setVoiceMode(mode: VoiceMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage blocked */ }
  useVoiceMode.setState({ mode });
  if (mode === 'off') hushAll();
  if (mode === 'natural') warmNaturalVoice();
}

/** What actually speaks in a class: Natural falls back to System until it is downloaded, and
 *  on a device too slow to make speech as fast as the lesson plays (it would fall behind). */
const effectiveMode = (): VoiceMode => {
  const m = useVoiceMode.getState().mode;
  return m === 'natural' && (!naturalDownloaded() || !naturalKeepsUp()) ? 'system' : m;
};

// ---------- where the voice may come out ----------

/** The page in this tab teaches (lib/voiceFront.ts holds the one rule). */
const onSpeakingPage = () => typeof location === 'undefined' || speaksOn(location.pathname);
const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** speakers that spoke since their last stop() */
const speakers = new Set<Speaker>();
/** the settings page's sample, so Stop and hushAll can end it */
let stopPreview: (() => void) | null = null;
/** Stop every voice on this page at once (the boards keep their timing at reading pace). */
export function hushAll() {
  for (const s of speakers) s.cutVoice();
  stopPreview?.();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

if (typeof window !== 'undefined') {
  // a tab out of view: cut the sentence being spoken; the next ones run silent at reading pace
  document.addEventListener('visibilitychange', () => { if (pageHidden()) hushAll(); });
  // another Chalkroom tab or window is the one in use now (lib/voiceFront.ts): fall quiet
  onVoiceOwner((owned) => { if (!owned) hushAll(); });
  // leaving a class page in this tab (a link, back, forward) cuts the voice at once
  const check = () => { if (!onSpeakingPage()) hushAll(); };
  window.addEventListener('popstate', check);
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  nav?.addEventListener('currententrychange', check);
}

const readingMs = (text: string, rate: number) => Math.max(1200, (text.split(/\s+/).length / 2.7) * 1000 / rate);
/** how long the first Natural sentence may take before the system voice says it instead */
const FIRST_SENTENCE_MS = 1800;
/** later sentences were prefetched; allow more, then fall back too */
const LATER_SENTENCE_MS = 5000;
/** the fastest the Natural voice speaks (kokoro.ts clamps its speed there) */
const NATURAL_MAX_RATE = 2;

export class Speaker {
  settings: VoiceSettings = { voice: '', rate: 1, muted: false, textOnly: false, lang: 'en' };
  private stopFns = new Set<() => void>();
  private voiceFns = new Set<() => void>();
  private generation = 0;
  private naturalSpoke = false;
  /** the class silenced the voice for now (in a side thread, class over); not the person's setting */
  silenced = false;

  /** No sound right now: the person's setting, the class, or where the page is. */
  get silent() {
    return this.settings.muted || this.settings.textOnly || this.silenced || effectiveMode() === 'off'
      || pageHidden() || !ownsVoice() || !onSpeakingPage();
  }

  /** Speak one sentence. Resolves when it ends, or when stop() is called. */
  speak(text: string): Promise<void> {
    if (this.silent || !text.trim()) return this.wait(readingMs(text, this.settings.rate));
    speakers.add(this);
    if (this.natural()) return this.speakNatural(text);
    return this.speakBrowser(text);
  }

  /** Natural speaks this sentence: chosen, ready, and no faster than Kokoro goes (2x). Above
   *  that the system voice reads it, so a sentence lasts as long whichever voice speaks. */
  private natural() { return effectiveMode() === 'natural' && this.settings.rate <= NATURAL_MAX_RATE; }

  /** Warm the next sentence so playback has no gaps (Natural voice only; the system voice needs none). */
  prefetch(text: string) {
    if (this.silent || !this.natural() || !useNaturalVoice.getState().live) return;
    void synthesize(text, this.settings.rate).catch(() => {});
  }

  stop() {
    this.generation++;
    speakers.delete(this);
    for (const f of [...this.stopFns]) f();
    this.stopFns.clear();
    this.voiceFns.clear();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** Cut only the sound of the sentence in progress; it still takes its reading time. */
  cutVoice() { for (const f of [...this.voiceFns]) f(); }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(done, ms);
      const self = this;
      function done() { clearTimeout(t); self.stopFns.delete(done); resolve(); }
      this.stopFns.add(done);
    });
  }

  /** The sound stopped early (hidden tab, left the page): the sentence keeps its reading time. */
  private finishSilently(text: string, startedAt: number) {
    return this.wait(Math.max(0, readingMs(text, this.settings.rate) - (performance.now() - startedAt)));
  }

  private async speakNatural(text: string): Promise<void> {
    const gen = this.generation;
    const startedAt = performance.now();
    const rate = this.settings.rate;
    // not loaded in this tab yet: start loading in the background, the system voice says this one
    if (!useNaturalVoice.getState().live) { warmNaturalVoice(); return this.speakBrowser(text); }
    let clip: { audio: Float32Array; rate: number } | null = null;
    try {
      const budget = this.naturalSpoke ? LATER_SENTENCE_MS : FIRST_SENTENCE_MS;
      clip = await Promise.race([
        synthesize(text, rate),
        new Promise<null>((r) => setTimeout(() => r(null), budget)),
      ]);
    } catch (e) {
      console.warn('Natural voice failed, using the system voice', e);
    }
    if (gen !== this.generation) return;
    if (this.silent) return this.finishSilently(text, startedAt);
    const ac = audioContext();
    if (ac && ac.state === 'suspended') await ac.resume().catch(() => {});
    if (!clip || !ac || ac.state !== 'running') return this.speakBrowser(text);
    this.naturalSpoke = true;
    const { audio, rate: sampleRate } = clip;
    return new Promise<void>((resolve) => {
      const buf = ac.createBuffer(1, audio.length, sampleRate);
      buf.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(ac.destination);
      let finished = false;
      const guard = setTimeout(() => done(), buf.duration * 1000 + 1500);
      const silence = () => { try { src.stop(); } catch { /* not started */ } };
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        silence();
        this.stopFns.delete(done);
        this.voiceFns.delete(cut);
        resolve();
      };
      // cut the sound but keep the sentence's time, so the board does not jump ahead
      const cut = () => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        silence();
        this.stopFns.delete(done);
        this.voiceFns.delete(cut);
        void this.finishSilently(text, startedAt).then(resolve);
      };
      src.onended = done;
      this.stopFns.add(done);
      this.voiceFns.add(cut);
      src.start();
    });
  }

  private speakBrowser(text: string): Promise<void> {
    if (!('speechSynthesis' in window)) return this.wait(readingMs(text, this.settings.rate));
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find((x) => x.voiceURI === this.settings.voice)
        ?? voices.find((x) => x.lang.toLowerCase().startsWith(this.settings.lang.toLowerCase()) && x.localService)
        ?? voices.find((x) => x.lang.toLowerCase().startsWith(this.settings.lang.toLowerCase()));
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = this.settings.lang;
      u.rate = this.settings.rate;
      let finished = false;
      let wasCut = false;
      // some engines never fire onend; never block the lesson on that
      const guard = setTimeout(() => done(), readingMs(text, this.settings.rate) * 2.2 + 2500);
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        this.stopFns.delete(stopper);
        this.voiceFns.delete(cut);
        // the sound was cut (hidden tab, left the page): the sentence keeps its reading time
        if (wasCut) void this.finishSilently(text, startedAt).then(resolve); else resolve();
      };
      const cut = () => { wasCut = true; };
      const stopper = () => { wasCut = false; done(); };
      u.onend = done;
      u.onerror = done;
      this.stopFns.add(stopper);
      this.voiceFns.add(cut);
      window.speechSynthesis.speak(u);
    });
  }
}

export function listBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const v = window.speechSynthesis.getVoices();
  if (v.length) return Promise.resolve(v);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1500);
    window.speechSynthesis.onvoiceschanged = () => { clearTimeout(t); resolve(window.speechSynthesis.getVoices()); };
  });
}

/** Play one sample sentence in a voice, from the settings page (a click, so audio may start).
 *  Calls onStart when the sound begins (the Natural voice may first need seconds to load) and
 *  resolves when it ends or is stopped (stopVoicePreview). Uses the person's speed. Natural falls
 *  back to System on any error. */
export async function previewVoice(mode: 'natural' | 'system', rate = 1, onStart?: () => void): Promise<'natural' | 'system'> {
  const text = 'This is how I will sound when I teach your class.';
  hushAll();
  let stopped = false;
  let end: () => void = () => {};
  const mine = () => { stopped = true; end(); };
  stopPreview = mine;
  try {
    if (mode === 'natural' && rate <= NATURAL_MAX_RATE) {
      const ac = audioContext();
      try {
        if (ac && ac.state === 'suspended') await ac.resume();
        const clip = await synthesize(text, rate);
        if (stopped) return 'natural';
        if (ac && ac.state === 'running') {
          const buf = ac.createBuffer(1, clip.audio.length, clip.rate);
          buf.copyToChannel(clip.audio as Float32Array<ArrayBuffer>, 0);
          const src = ac.createBufferSource();
          src.buffer = buf;
          src.connect(ac.destination);
          await new Promise<void>((r) => {
            end = () => { try { src.stop(); } catch { /* not started */ } r(); };
            src.onended = () => r();
            src.start();
            onStart?.();
          });
          return 'natural';
        }
      } catch (e) {
        if (stopped) return 'natural';
        console.warn('Natural voice sample failed, using the system voice', e);
      }
    }
    if (stopped || !('speechSynthesis' in window)) return 'system';
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en';
      u.rate = rate;
      const t = setTimeout(resolve, 8000 / Math.min(1, rate));
      const done = () => { clearTimeout(t); resolve(); };
      end = () => { window.speechSynthesis.cancel(); done(); };
      u.onstart = () => onStart?.();
      u.onend = u.onerror = done;
      window.speechSynthesis.speak(u);
    });
    return 'system';
  } finally {
    if (stopPreview === mine) stopPreview = null;
  }
}

/** Stop the settings page's sample now. */
export function stopVoicePreview() { stopPreview?.(); }

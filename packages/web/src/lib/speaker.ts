// Text-to-speech for the tutor. Two voices, chosen per device (Preferences, "Voice"): Natural
// (speech made on our server, one shared file per sentence, lib/serverVoice.ts) and System (the
// browser's Web Speech API). Off reads at caption pace without sound.
// Every speak() resolves when the sentence ends, whatever voice spoke it, so the board player's
// timing never changes. A sentence the server has not made in time is read by the system voice.
// The voice only ever comes out of the page in front of the person: never from a hidden tab,
// never from a tab behind another Chalkroom tab, and never from a page that is not a class or a replay.
import { create } from 'zustand';
import { TTS_SAMPLE as SAMPLE } from '@chalk/schema';
import { clipFor, clipWithin, loadServerVoice, useServerVoice } from './serverVoice';
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
/** the person's own choice on this device; null until they make one */
const storedMode = (): VoiceMode | null => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'natural' || v === 'system' || v === 'off' ? v : null;
  } catch { return null; }
};

/** The voice this device uses (a hook for the settings UI). Without a choice: Natural when the
 *  server makes it (/health says tts: 'kokoro'), else System. */
export const useVoiceMode = create<{ mode: VoiceMode }>(() => ({ mode: storedMode() ?? 'system' }));

useServerVoice.subscribe(({ engine }) => {
  if (engine && !storedMode()) useVoiceMode.setState({ mode: engine === 'kokoro' ? 'natural' : 'system' });
});
loadServerVoice();

export function setVoiceMode(mode: VoiceMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage blocked */ }
  useVoiceMode.setState({ mode });
  if (mode === 'off') hushAll();
}

/** What actually speaks in a class: Natural only while the server makes it. */
const effectiveMode = (): VoiceMode => {
  const m = useVoiceMode.getState().mode;
  return m === 'natural' && useServerVoice.getState().engine === 'off' ? 'system' : m;
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

// ---------- the one audio element the Natural voice plays through ----------

/** A short silent WAV: played once on the first tap or key, so phones (iOS) let this element
 *  play the lesson's sentences later without another tap. */
function silentWav(): string {
  const n = 240;
  const b = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, 24000, true);
  b.setUint32(28, 48000, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); str(36, 'data'); b.setUint32(40, n * 2, true);
  let s = '';
  for (const x of new Uint8Array(b.buffer)) s += String.fromCharCode(x);
  return `data:audio/wav;base64,${btoa(s)}`;
}

let voiceEl: HTMLAudioElement | null = null;
const voiceElement = (): HTMLAudioElement | null => {
  if (typeof Audio === 'undefined') return null;
  if (!voiceEl) { voiceEl = new Audio(); voiceEl.preload = 'auto'; }
  return voiceEl;
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // a tab out of view: cut the sentence being spoken; the next ones run silent at reading pace
  document.addEventListener('visibilitychange', () => { if (pageHidden()) hushAll(); });
  // another Chalkroom tab or window is the one in use now (lib/voiceFront.ts): fall quiet
  onVoiceOwner((owned) => { if (!owned) hushAll(); });
  // leaving a class page in this tab (a link, back, forward) cuts the voice at once
  const check = () => { if (!onSpeakingPage()) hushAll(); };
  window.addEventListener('popstate', check);
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  nav?.addEventListener('currententrychange', check);
  // unlock the audio element with the person's first tap or key (phones need it)
  const unlock = () => {
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    const el = voiceElement();
    if (!el || el.src) return;
    const silence = silentWav();
    el.src = silence;
    void el.play().then(() => { if (el.src === silence) el.pause(); }, () => {});
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}

const readingMs = (text: string, rate: number) => Math.max(1200, (text.split(/\s+/).length / 2.7) * 1000 / rate);
/** how long a sentence may wait for its server audio before the system voice says it */
const NATURAL_WAIT_MS = 1200;
/** The opening sentence after a quiet spell is asked for the moment the tutor writes it, so the
 *  server has not made it yet (1 to 3 s). Waiting a little longer there keeps one voice for the
 *  whole lesson; the sentences after it are made ahead and need no wait. */
const NATURAL_FIRST_WAIT_MS = 4500;
/** after this much quiet, the next sentence counts as an opening one */
const QUIET_MS = 8000;

export class Speaker {
  settings: VoiceSettings = { voice: '', rate: 1, muted: false, textOnly: false, lang: 'en' };
  private stopFns = new Set<() => void>();
  private voiceFns = new Set<() => void>();
  private generation = 0;
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
    if (effectiveMode() === 'natural') return this.speakNatural(text);
    return this.speakBrowser(text);
  }

  /** Fetch a coming sentence's audio now, so it plays without a gap (Natural voice only). */
  prefetch(text: string) {
    if (this.silent || effectiveMode() !== 'natural' || !text.trim()) return;
    void clipFor(text);
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

  /** when the last server sentence finished (an opening sentence after a quiet spell waits longer) */
  private lastNaturalEnd = -Infinity;

  private async speakNatural(text: string): Promise<void> {
    const gen = this.generation;
    const startedAt = performance.now();
    const rate = this.settings.rate;
    // wait for the server's audio briefly; stop() ends the wait at once
    let cancel: () => void = () => {};
    const stopped = new Promise<null>((r) => { cancel = () => r(null); });
    this.stopFns.add(cancel);
    const opening = performance.now() - this.lastNaturalEnd > QUIET_MS;
    const url = await Promise.race([clipWithin(text, opening ? NATURAL_FIRST_WAIT_MS : NATURAL_WAIT_MS), stopped]);
    this.stopFns.delete(cancel);
    if (gen !== this.generation) return;
    if (this.silent) return this.finishSilently(text, startedAt);
    const el = voiceElement();
    if (!url || !el) return this.speakBrowser(text);
    el.src = url;
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
    el.preservesPitch = true;
    let started = true;
    await el.play().catch(() => { started = false; });
    if (gen !== this.generation) { el.pause(); return; }
    // the browser refused to play (no tap yet): the system voice reads it
    if (!started) return this.speakBrowser(text);
    return new Promise<void>((resolve) => {
      let finished = false;
      const end = () => { el.onended = null; el.onerror = null; el.onloadedmetadata = null; };
      const settle = () => { finished = true; clearTimeout(guard); end(); this.stopFns.delete(done); this.voiceFns.delete(cut); };
      // some players never fire ended; never hold the lesson on that
      let guard = setTimeout(() => done(), readingMs(text, rate) * 2.2 + 4000);
      const fit = () => {
        if (!Number.isFinite(el.duration) || finished) return;
        clearTimeout(guard);
        guard = setTimeout(() => done(), (el.duration * 1000) / rate + 1500);
      };
      const done = () => {
        if (finished) return;
        settle();
        el.pause();
        this.lastNaturalEnd = performance.now();
        resolve();
      };
      // cut the sound but keep the sentence's time, so the board does not jump ahead
      const cut = () => {
        if (finished) return;
        settle();
        el.pause();
        void this.finishSilently(text, startedAt).then(resolve);
      };
      el.onended = done;
      el.onerror = done;
      el.onloadedmetadata = fit;
      fit();
      this.stopFns.add(done);
      this.voiceFns.add(cut);
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
 *  Calls onStart when the sound begins (the server may first need a few seconds to make it) and
 *  resolves when it ends or is stopped (stopVoicePreview). Uses the person's speed. Natural falls
 *  back to System on any error. */
export async function previewVoice(mode: 'natural' | 'system', rate = 1, onStart?: () => void): Promise<'natural' | 'system'> {
  hushAll();
  let stopped = false;
  let end: () => void = () => {};
  const mine = () => { stopped = true; end(); };
  stopPreview = mine;
  try {
    if (mode === 'natural') {
      // made on demand the first time (POST /tts, then polled): allow the server a few seconds
      const url = await clipWithin(SAMPLE, 9000);
      if (stopped) return 'natural';
      if (url && typeof Audio !== 'undefined') {
        const el = new Audio(url);
        el.defaultPlaybackRate = rate;
        el.playbackRate = rate;
        el.preservesPitch = true;
        const played = await new Promise<boolean>((r) => {
          end = () => { el.pause(); r(true); };
          el.onended = () => r(true);
          el.onerror = () => r(false);
          el.play().then(() => onStart?.(), () => r(false));
        });
        if (played || stopped) return 'natural';
      }
    }
    if (stopped || !('speechSynthesis' in window)) return 'system';
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(SAMPLE);
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

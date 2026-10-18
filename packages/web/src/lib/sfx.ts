// Sound effects: very quiet paper-and-pencil sounds, off by default, one switch per device.
// play(name) is silent unless the person turned sound effects on (account page, Preferences),
// and also silent with reduced motion, while the tab is out of view, before any click (browsers
// block audio until then), off a teaching page, and in any tab that does not hold the one tutor
// voice (lib/voiceFront.ts), so a class left open elsewhere never sounds over the lobby.
// The class cues are wired in lib/sfxCues.ts and lib/player.ts (page turns). Clips live in public/sfx/ (CC0; see CREDITS.txt there).
//
//   import { play } from '../lib/sfx';
//   play('page-turn');          // the tutor turns to a new page
//   play('bell');               // a check or a gate opens
//   play('sticky');             // a grouped question lands on the board
//   play('pencil');             // the person's note or answer is written down
//   play('click'); play('confirm');
import { create } from 'zustand';
import { ownsVoice, speaksOn } from './voiceFront';

export type SoundName = 'page-turn' | 'pencil' | 'bell' | 'sticky' | 'click' | 'confirm';

const KEY = 'chalkroom.sfx';
/** loudness of each clip on top of the master level, so none stands out */
const LEVEL: Record<SoundName, number> = { 'page-turn': 0.8, pencil: 0.7, bell: 0.55, sticky: 0.75, click: 0.5, confirm: 0.5 };
const MASTER = 0.22;
const MIN_GAP_MS = 90;

const stored = () => { try { return localStorage.getItem(KEY) === 'on'; } catch { return false; } };

/** Whether sound effects are on for this device (a hook for the settings UI). */
export const useSoundEffects = create<{ on: boolean }>(() => ({ on: stored() }));

export function setSoundEffects(on: boolean) {
  try { if (on) localStorage.setItem(KEY, 'on'); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  useSoundEffects.setState({ on });
  if (on) void ensureContext(true)?.resume().catch(() => {});
}

export const soundEffectsOn = () => useSoundEffects.getState().on;

const reducedMotion = () =>
  document.documentElement.dataset.motion === 'reduced'
  || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

let ctx: AudioContext | null = null;
let gestured = false;

/** The page's one AudioContext, made only after a user gesture (or when asked to). */
function ensureContext(force = false): AudioContext | null {
  if (ctx) return ctx;
  if (!force && !gestured) return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { return null; }
  return ctx;
}

/** Shared with the Natural voice (lib/speaker.ts): one audio clock per page. */
export function audioContext(): AudioContext | null { return ensureContext(true); }

// browsers only start audio after a click or key press: wake the context on the first one
if (typeof document !== 'undefined') {
  const wake = () => {
    gestured = true;
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
  };
  document.addEventListener('pointerdown', wake, { capture: true, passive: true });
  document.addEventListener('keydown', wake, { capture: true });
}

const buffers = new Map<SoundName, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundName, number>();

function buffer(name: SoundName, ac: AudioContext) {
  let b = buffers.get(name);
  if (!b) {
    b = fetch(`${import.meta.env.BASE_URL}sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => ac.decodeAudioData(data))
      .catch(() => { buffers.delete(name); return null; });
    buffers.set(name, b);
  }
  return b;
}

/** Load the clips ahead of time (call when a class opens, if you like). Silent and cheap when off. */
export function preloadSounds(names: SoundName[] = ['page-turn', 'pencil', 'bell', 'sticky']) {
  if (!soundEffectsOn()) return;
  const ac = ensureContext();
  if (ac) for (const n of names) void buffer(n, ac);
}

/** Play one sound effect, if this person wants them. Never throws, never waits.
 *  `preview` is the settings page's own sample: it skips the page and voice-owner rules. */
export function play(name: SoundName, opts: { volume?: number; preview?: boolean } = {}): void {
  if (!soundEffectsOn() || reducedMotion() || document.visibilityState === 'hidden') return;
  if (!opts.preview && (!speaksOn(location.pathname) || !ownsVoice())) return;
  const ac = ensureContext();
  if (!ac || ac.state === 'closed') return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < MIN_GAP_MS) return;
  lastPlayed.set(name, now);
  void buffer(name, ac).then((buf) => {
    if (!buf) return;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    gain.gain.value = MASTER * LEVEL[name] * Math.min(1, Math.max(0, opts.volume ?? 1));
    src.connect(gain).connect(ac.destination);
    src.start();
  }).catch(() => {});
}

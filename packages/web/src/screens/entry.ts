// A6/A7 (Dev A): helpers for the way into a class: voice unlock, the remembered "join muted"
// choice, and plain-words errors for Home and the pre-join page.
import { ApiError } from '../lib/api';

const MUTED_KEY = 'chalkroom.joinMuted';

export const joinMuted = {
  get: () => { try { return localStorage.getItem(MUTED_KEY) === '1'; } catch { return false; } },
  set: (v: boolean) => { try { localStorage.setItem(MUTED_KEY, v ? '1' : '0'); } catch { /* storage blocked */ } },
};

/** Browsers only let text-to-speech play after a user gesture: call this inside a click. */
export function unlockVoice() {
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch { /* nothing to unlock */ }
}

export type Problem = { kind: 'notfound' | 'full' | 'ended' | 'network' | 'other'; text: string };

/** Turn a failed request into the problem and the fix, in the product's words. */
export function describe(err: unknown, action: 'join' | 'create' | 'open'): Problem {
  if (err instanceof ApiError) {
    const m = err.message.toLowerCase();
    if (err.status === 404) return { kind: 'notfound', text: 'No class uses this code. Check the code with whoever invited you, or start a class of your own.' };
    if (/full|seat/.test(m)) return { kind: 'full', text: 'This class is full: all five seats are taken. Ask the host to start a new room, or start your own.' };
    if (/ended|over|closed/.test(m)) return { kind: 'ended', text: 'This class has ended. Start a new class to keep learning.' };
    if (err.status === 429) return { kind: 'other', text: 'Too many tries in a short time. Wait a few seconds, then try again.' };
    if (err.status >= 500) return { kind: 'other', text: `The class server had a problem and could not ${action === 'create' ? 'open the room' : 'let you in'}. Try again in a moment.` };
    return { kind: 'other', text: `${err.message.replace(/\.$/, '')}. Fix that and try again.` };
  }
  return { kind: 'network', text: 'Could not reach the class server. Check your internet connection, then try again.' };
}

// Motion 2.0 helpers. The classroom has no animation library: CSS (tokens in styles.css) plus
// the View Transitions API through transition(). Where the browser lacks view transitions, or
// the person prefers reduced motion, transition() just runs the update: the state change is
// still visible, only the movement goes.
import { flushSync } from 'react-dom';

type ViewTransitionLike = { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> };
type StartViewTransition = (cb: () => void) => ViewTransitionLike;

/** True when the OS asks for reduced motion (unless the account says full) or the account asks for it. */
export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return true;
  const pref = document.documentElement.dataset.motion;
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Run a DOM or state update inside a view transition when the browser supports it and motion is
 * allowed. React state set inside fn is flushed synchronously so the new DOM is captured.
 * Name the parts that should morph with CSS `view-transition-name`. Resolves when the update
 * (and any animation) is done; never rejects.
 */
export function transition(fn: () => void): Promise<void> {
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;
  if (!start || prefersReducedMotion() || document.visibilityState === 'hidden') {
    fn();
    return Promise.resolve();
  }
  const run = () => { flushSync(fn); };
  try {
    // a transition still in flight is skipped by the browser in favour of this one; a skipped
    // transition rejects all three promises, so each gets a handler (no uncaught page errors)
    const vt = start.call(document, run);
    vt.ready.catch(() => {});
    vt.updateCallbackDone.catch(() => {});
    return vt.finished.catch(() => {});
  } catch {
    fn();
    return Promise.resolve();
  }
}

/** CSS duration tokens in ms, read live so reduced motion (0) is respected in JS timing too. */
export function cssDuration(token: '--dur-quick' | '--dur-pen' | '--dur-char' | '--dur-note' | '--dur-turn' | '--dur-stamp', fallback = 0): number {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(v);
  if (Number.isNaN(n)) return fallback;
  return v.endsWith('ms') ? n : v.endsWith('s') ? n * 1000 : n;
}

export const EASE = {
  out: 'cubic-bezier(.2, .7, .2, 1)',
  pen: 'cubic-bezier(.45, .05, .4, 1)',
  settle: 'cubic-bezier(.2, 1.25, .35, 1)',
  stamp: 'cubic-bezier(.2, 1.6, .35, 1)',
} as const;

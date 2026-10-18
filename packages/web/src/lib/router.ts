// Tiny path router: no dependency needed for a handful of routes.
// navigate() runs the route change as a view transition (ui/motion.ts), then on a forward
// navigation scrolls to the top, moves focus to the new page's heading (or main landmark) and
// announces the page politely for screen readers.
import { useSyncExternalStore } from 'react';
import { transition } from '../ui/motion';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener('popstate', () => {
  notify();
  // the phone menu (ui/PhoneNav.tsx) closing pops its own history entry: same page, so no
  // focus move and no page announcement
  const w = window as { __pnClosing?: boolean };
  if (w.__pnClosing) { w.__pnClosing = false; return; }
  afterNavigate(false);
});

export function navigate(path: string, replace = false) {
  const from = location.pathname;
  // the URL changes at once (callers may read it); only the re-render runs in the transition
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  void transition(notify);
  // a hash or query change on the same page is not a new page
  if (new URL(path, location.href).pathname !== from) afterNavigate(!replace);
}

export function usePath() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => location.pathname);
}

/** A page still loading: the route skeleton, a marked loading state, or a bare top-level placeholder. */
const LOADING = '.page-skeleton, [data-loading], #root > .empty';

let pending = 0;
/** Wait for the new page (lazy routes render a skeleton first), then focus and announce it. */
function afterNavigate(forward: boolean) {
  const id = ++pending;
  if (forward) window.scrollTo(0, 0);
  let frames = 0;
  const tick = () => {
    if (id !== pending) return;
    const target = document.querySelector<HTMLElement>('main h1, [data-page-heading], h1')
      ?? document.querySelector<HTMLElement>('main, [role="main"]');
    // keep waiting while the lazy chunk loads (about two seconds), and while the page shows a
    // loading state of its own (the classroom's 'Opening the class' until realtime is ready),
    // up to about ten seconds
    const loading = !!document.querySelector(LOADING);
    if ((!target || loading) && frames++ < (loading ? 600 : 120)) { requestAnimationFrame(tick); return; }
    if (!target) return;
    if (forward) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
    announce(target.matches('h1, [data-page-heading]') ? target.textContent ?? '' : document.title);
  };
  requestAnimationFrame(tick);
}

function announce(text: string) {
  const words = text.replace(/\s+/g, ' ').trim();
  if (!words) return;
  let el = document.getElementById('route-announcer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'route-announcer';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
  }
  el.textContent = '';
  const node = el;
  setTimeout(() => { node.textContent = words; }, 60);
}

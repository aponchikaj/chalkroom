// Phones only (the app's one phone breakpoint, 760 px). Classroom features use these to render
// phone-only markup and to keep the live class above the soft keyboard; desktop never sees them.
import { useEffect, useState, useSyncExternalStore } from 'react';

export const PHONE_QUERY = '(max-width: 760px)';

const subscribe = (fn: () => void) => {
  if (typeof matchMedia !== 'function') return () => {};
  const m = matchMedia(PHONE_QUERY);
  m.addEventListener('change', fn);
  return () => m.removeEventListener('change', fn);
};

/** True on a phone-width screen. */
export function usePhone() {
  return useSyncExternalStore(subscribe, () => typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches, () => false);
}

/**
 * Phones: follows the visual viewport (what is left above the soft keyboard) and publishes it as
 * --vvh (height) and --vvt (offset from the layout top) on <html>, so the classroom can pin
 * itself to the part of the screen the person can see. Returns true while the keyboard is up.
 */
export function useVisualViewport(enabled: boolean) {
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const root = document.documentElement;
    if (!enabled || !vv) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
        root.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
        // a soft keyboard takes a large share of the screen; pinch zoom only scales (vv.scale)
        const typing = document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea, [contenteditable="true"]');
        setKeyboard(typing && vv.scale < 1.05 && vv.height < window.innerHeight * 0.8);
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
      root.style.removeProperty('--vvh');
      root.style.removeProperty('--vvt');
    };
  }, [enabled]);
  return enabled && keyboard;
}

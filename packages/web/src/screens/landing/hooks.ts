// Small hooks for the landing page: reveal-on-view and the section the reader is on.
import { useEffect, useState, type RefObject } from 'react';

/** True once the element has come into view (stays true). Without IntersectionObserver it is true at once. */
export function useSeen(ref: RefObject<Element | null>, threshold = 0.25): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, threshold]);
  return seen;
}

/** The id of the section that crosses the reading line (40% down the viewport). */
export function useCurrentSection(ids: readonly string[]): string {
  const [current, setCurrent] = useState(ids[0]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
    }, { rootMargin: '-40% 0px -59% 0px' });
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [ids]);
  return current;
}

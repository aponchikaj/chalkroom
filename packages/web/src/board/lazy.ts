// KaTeX and highlight.js load only when a formula or code shape first appears on a board (like
// mermaid), so the classroom's first paint does not carry them. Each library loads once; every
// later shape gets it synchronously from the module cache.
import { useEffect, useState } from 'react';

type Katex = typeof import('katex').default;
type Hljs = typeof import('highlight.js/lib/common').default;

function loader<T>(load: () => Promise<T>) {
  let value: T | null = null;
  let pending: Promise<T> | null = null;
  const get = () => {
    if (!pending) {
      pending = load().then((v) => (value = v));
      // a failed chunk load (offline, a deploy in between) may be retried by the next shape
      pending.catch(() => { pending = null; });
    }
    return pending;
  };
  return function useLib(): { lib: T | null; failed: boolean } {
    const [, bump] = useState(0);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (value) return;
      let alive = true;
      get().then(() => { if (alive) bump((n) => n + 1); }, () => { if (alive) setFailed(true); });
      return () => { alive = false; };
    }, []);
    return { lib: value, failed };
  };
}

export const useKatex = loader<Katex>(async () => {
  const [mod] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')]);
  return mod.default;
});

export const useHljs = loader<Hljs>(async () => (await import('highlight.js/lib/common')).default);

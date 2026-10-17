// Tiny path router: "/" home, "/r/:code" a room. No dependency needed for two routes.
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  listeners.forEach((l) => l());
}

export function usePath() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => location.pathname);
}

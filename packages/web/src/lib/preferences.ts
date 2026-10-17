// AS: the signed-in user's preferences (UserSettings), made real on this device: tutor voice and
// speed on the main board player, captions and fewer animations as attributes on <html> that the
// rules in screens/account/preferences.css read. Call loadPreferences() once after sign-in.
import { create } from 'zustand';
import { DEFAULT_SETTINGS, type UserSettings } from '@chalk/schema';
import { api } from './api';
import { mainPlayer } from '../room/store';
import '../screens/account/preferences.css';

const CACHE_KEY = 'chalkroom.preferences';

const cached = (): UserSettings | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<UserSettings>) } : null;
  } catch { return null; }
};
const cache = (s: UserSettings) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* storage blocked */ } };

interface PrefStore {
  settings: UserSettings;
  /** settings came from the API in this session */
  loaded: boolean;
  /** the last load failed (the page keeps showing the cached or default values) */
  error: string | null;
}

export const usePrefStore = create<PrefStore>(() => ({ settings: cached() ?? DEFAULT_SETTINGS, loaded: false, error: null }));

/** Apply settings across the app on this device. */
export function applyPreferences(s: UserSettings) {
  const html = document.documentElement;
  if (s.captions) delete html.dataset.captions; else html.dataset.captions = 'off';
  if (s.reducedMotion) html.dataset.motion = 'reduced'; else delete html.dataset.motion;
  mainPlayer.voiceRate = s.voiceRate;
  if (mainPlayer.speaker.settings.muted !== !s.tutorVoice) mainPlayer.setMuted(!s.tutorVoice);
}

// before /me answers, the last known settings already hold (no flash of animation or captions)
{
  const c = cached();
  if (c) applyPreferences(c);
}

const settle = (s: UserSettings) => {
  cache(s);
  applyPreferences(s);
  usePrefStore.setState({ settings: s, loaded: true, error: null });
};

/** Fetch the settings after sign-in and apply them. Never throws. */
export async function loadPreferences(): Promise<UserSettings> {
  try {
    const s = await api.settings();
    settle(s);
    return s;
  } catch (e) {
    usePrefStore.setState({ error: (e as Error).message });
    return usePrefStore.getState().settings;
  }
}

/** Change some settings: applied at once, then saved; reverted (and rethrown) when saving fails. */
export async function updatePreferences(patch: Partial<UserSettings>): Promise<UserSettings> {
  const before = usePrefStore.getState().settings;
  const next = { ...before, ...patch };
  applyPreferences(next);
  usePrefStore.setState({ settings: next });
  try {
    const saved = await api.updateSettings(patch);
    // a later change may have landed meanwhile: keep it, take the server's word for this patch
    const now = usePrefStore.getState().settings;
    const merged = { ...now, ...Object.fromEntries(Object.keys(patch).map((k) => [k, saved[k as keyof UserSettings]])) } as UserSettings;
    settle(merged);
    return merged;
  } catch (e) {
    const now = usePrefStore.getState().settings;
    const reverted = { ...now, ...Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof UserSettings]])) } as UserSettings;
    applyPreferences(reverted);
    usePrefStore.setState({ settings: reverted });
    throw e;
  }
}

/** The current settings and a way to change them. */
export function usePreferences() {
  const settings = usePrefStore((s) => s.settings);
  const loaded = usePrefStore((s) => s.loaded);
  const error = usePrefStore((s) => s.error);
  return { settings, loaded, error, update: updatePreferences, reload: loadPreferences };
}

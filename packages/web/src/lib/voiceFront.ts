// Lane V: one tutor voice per browser, and only on pages that teach.
// Every Chalkroom tab or window claims the voice when the person acts in it (opens it, focuses
// it, clicks or types); every other Chalkroom tab hears the claim and goes quiet until the person
// comes back to it. So a class left running in one window never talks over the lobby, Home, the
// login page or another class the person is using. A page claims as soon as this module loads,
// so it must load on every page (lib/preferences.ts and lib/speaker.ts import it; main.tsx
// should too). No imports: it is safe to load first, on any page.
// BroadcastChannel only; where it is missing, each tab keeps its own voice. The channel reaches
// only tabs of one origin in one browser profile: a class left open in another profile, a private
// window, another browser or on another origin (localhost and 127.0.0.1, or the deployed site and
// local dev) cannot be told to go quiet from here. Leaving the class (any route that is not a
// class) still stops its voice in that tab. A focus timeout was not added on purpose: people
// listen to a class while writing in another app.

type Listener = (owned: boolean) => void;

const CHANNEL = 'chalkroom.voice-front';
const TAB = Math.random().toString(36).slice(2) + Date.now().toString(36);
const listeners = new Set<Listener>();
let owned = true;
let channel: BroadcastChannel | null = null;
let installed = false;

/** Pages where the tutor may speak: a class, a replay, the dev classroom. */
export const speaksOn = (path: string) =>
  path.startsWith('/r/') || /^\/c\/[^/]+\/replay/.test(path) || path.startsWith('/dev/classroom');

function set(next: boolean) {
  if (owned === next) return;
  owned = next;
  for (const fn of [...listeners]) fn(owned);
}

/** This tab takes the voice; every other Chalkroom tab goes quiet. */
export function claimVoice() {
  installVoiceFront();
  set(true);
  try { channel?.postMessage({ claim: TAB }); } catch { /* channel closed */ }
}

/** Whether this tab may speak now. */
export function ownsVoice() { return owned; }

/** Follow this tab's ownership of the voice; returns the unsubscribe. */
export function onVoiceOwner(fn: Listener) {
  installVoiceFront();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Listen for claims from other tabs and claim on the person's actions here. Runs on import. */
export function installVoiceFront() {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (e: MessageEvent<{ claim?: string }>) => { if (e.data?.claim && e.data.claim !== TAB) set(false); };
      // never keeps a test process alive (Node); browsers have no unref
      (channel as unknown as { unref?: () => void }).unref?.();
    } catch { channel = null; }
  }
  // the person acting in this tab is the person listening to it
  const take = () => { if (!owned) claimVoice(); };
  window.addEventListener('focus', take);
  window.addEventListener('pointerdown', take, { capture: true, passive: true });
  window.addEventListener('keydown', take, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus())) take();
  });
  // a page opened in front is the one the person is using
  if (document.visibilityState !== 'hidden') claimVoice();
}

installVoiceFront();

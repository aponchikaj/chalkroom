// Browser Supabase client. Accounts are required (email + password, Supabase Auth): there is no
// anonymous sign-in any more. Screens behind the login gate can rely on a session existing.
// Local dev shortcut: against the LOCAL stack with VITE_DEV_LOGIN=1 (written by `npm run env`),
// opening the app with ?as=<name> signs in a test account, so two tabs can be two learners
// (?as=ana, ?as=gio). Without ?as= the normal login screens show.
import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Run "npm run env" at the repo root.');

const devAllowed = import.meta.env.DEV && import.meta.env.VITE_DEV_LOGIN === '1' && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
/** the dev test account for this tab: ?as=, remembered per tab (sessionStorage) so in-app
 *  navigation that drops the query keeps the same person; null when dev login is not in use */
const devName = (() => {
  if (!devAllowed) return null;
  const asked = new URLSearchParams(location.search).get('as');
  let name = asked ?? (() => { try { return sessionStorage.getItem('chalkroom-dev-as'); } catch { return null; } })();
  if (!name) return null;
  name = name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'dev';
  try { sessionStorage.setItem('chalkroom-dev-as', name); } catch { /* private mode */ }
  return name;
})();

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, ...(devName ? { storageKey: `chalkroom-dev-${devName}` } : {}) },
});

/** Thrown when an action needs an account and nobody is signed in. */
export class NotSignedIn extends Error {
  constructor() { super('Sign in to continue.'); }
}

const DEV_PASSWORD = 'Dev-password-123';

/** Local testing only: sign in (or register, the first time) the test account named by ?as=. */
async function devSession(name: string): Promise<Session> {
  const email = `${name}@dev.chalkroom.local`;
  const signIn = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (signIn.data.session) return signIn.data.session;
  const up = await supabase.auth.signUp({ email, password: DEV_PASSWORD, options: { data: { display_name: name[0].toUpperCase() + name.slice(1) } } });
  if (up.error || !up.data.session) throw new Error(`dev login failed: ${up.error?.message ?? signIn.error?.message ?? 'no session'}`);
  return up.data.session;
}

// dev login starts at load, so the login gate sees the session arrive (onAuthStateChange)
if (devName) {
  void supabase.auth.getSession().then(({ data }) => {
    if (!data.session) return devSession(devName);
  }).catch((e: Error) => console.warn(e.message));
}

/** The signed-in session. Throws NotSignedIn when there is none (the login gate shows first). */
export async function ensureSession(): Promise<Session> {
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.is_anonymous) throw new NotSignedIn();
  return data.session;
}

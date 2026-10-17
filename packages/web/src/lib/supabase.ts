// Browser Supabase client. Accounts are required (B9): the login screens (A8) sign people in with
// supabase.auth.signInWithPassword / signUp. Until they exist, a dev build against the LOCAL stack
// signs in a test account (VITE_DEV_LOGIN=1, written by `npm run env`): ?as=<name> picks the
// account, so two tabs can be two learners (?as=ana, ?as=gio).
import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Run "npm run env" at the repo root.');



const devLogin = import.meta.env.DEV && import.meta.env.VITE_DEV_LOGIN === '1' && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);
/** dev login: the test account named by ?as=, remembered for this tab (sessionStorage is per tab)
 *  so in-app navigation that drops the query keeps the same person; each name has its own session */
const devName = (() => {
  const asked = new URLSearchParams(location.search).get('as');
  let name = asked ?? (() => { try { return sessionStorage.getItem('chalkroom-dev-as'); } catch { return null; } })() ?? 'dev';
  name = name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'dev';
  try { sessionStorage.setItem('chalkroom-dev-as', name); } catch { /* private mode */ }
  return name;
})();

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, ...(devLogin ? { storageKey: `chalkroom-dev-${devName}` } : {}) },
});

let pending: Promise<Session> | null = null;

/** No session and no way to make one here: the app should show its login screen. */
export class LoginRequired extends Error {
  constructor() { super('Log in to continue'); }
}

const DEV_PASSWORD = 'Dev-password-123';

/** Local testing only: sign in (or register, the first time) the test account named by ?as=. */
async function devSession(): Promise<Session> {
  const name = devName;
  const email = `${name}@dev.chalkroom.local`;
  const signIn = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (signIn.data.session) return signIn.data.session;
  const up = await supabase.auth.signUp({ email, password: DEV_PASSWORD, options: { data: { display_name: name[0].toUpperCase() + name.slice(1) } } });
  if (up.error || !up.data.session) throw new Error(`dev login failed: ${up.error?.message ?? signIn.error?.message ?? 'no session'}`);
  return up.data.session;
}

/** The current session. Throws LoginRequired when there is none (outside local dev login). */
export function ensureSession(): Promise<Session> {
  pending ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    if (devLogin) return devSession();
    throw new LoginRequired();
  })().catch((e) => { pending = null; throw e; });
  return pending;
}

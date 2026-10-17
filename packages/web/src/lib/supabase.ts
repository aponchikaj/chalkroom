// Browser Supabase client. Accounts are required (email + password, Supabase Auth): there is no
// anonymous sign-in any more. Screens behind the login gate can rely on a session existing.
import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Run "npm run env" at the repo root.');

export const supabase = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

/** Thrown when an action needs an account and nobody is signed in. */
export class NotSignedIn extends Error {
  constructor() { super('Sign in to continue.'); }
}

/** The signed-in session. Throws NotSignedIn when there is none (the login gate shows first). */
export async function ensureSession(): Promise<Session> {
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.is_anonymous) throw new NotSignedIn();
  return data.session;
}

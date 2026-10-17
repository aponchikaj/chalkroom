// Browser Supabase client. Everyone signs in anonymously on first visit (no signup);
// the account can be claimed later with an email (P2).
import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Run "npm run env" at the repo root.');

export const supabase = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

let pending: Promise<Session> | null = null;

/** The current session, signing in anonymously if there is none. */
export function ensureSession(): Promise<Session> {
  pending ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    const r = await supabase.auth.signInAnonymously();
    if (r.error || !r.data.session) throw new Error(`Could not sign in: ${r.error?.message ?? 'no session'}`);
    return r.data.session;
  })().catch((e) => { pending = null; throw e; });
  return pending;
}

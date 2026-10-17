// Who is signed in. Accounts are email + password (Supabase Auth, called from the browser); the
// profile, settings and second-factor state come from GET /me. The login gate in main.tsx reads
// `status`: loading -> signedOut | mfa (a second factor is still owed) | signedIn.
import { create } from 'zustand';
import type { MeRes } from '@chalk/schema';
import { supabase } from './supabase';
import { api, ApiError } from './api';

export type AuthStatus = 'loading' | 'signedOut' | 'mfa' | 'signedIn';

interface AuthStore {
  status: AuthStatus;
  me: MeRes | null;
  /** last /me failure that was not "signed out" (network down, API error) */
  error: string | null;
}

export const useAuth = create<AuthStore>(() => ({ status: 'loading', me: null, error: null }));

/** Re-read /me and settle the status. Call after sign-in, a second factor or a profile change. */
export async function refreshMe(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.is_anonymous) {
    useAuth.setState({ status: 'signedOut', me: null, error: null });
    return;
  }
  try {
    const me = await api.me();
    useAuth.setState({ status: me.security.mfaPassed ? 'signedIn' : 'mfa', me, error: null });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'mfa_required') useAuth.setState({ status: 'mfa', error: null });
    else if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      // a stale or anonymous token: start clean
      await supabase.auth.signOut();
      useAuth.setState({ status: 'signedOut', me: null, error: null });
    } else useAuth.setState({ error: (e as Error).message, status: useAuth.getState().me ? useAuth.getState().status : 'signedOut' });
  }
}

let started = false;
/** Start tracking the session once, at app start. */
export function initAuth() {
  if (started) return;
  started = true;
  void refreshMe();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'MFA_CHALLENGE_VERIFIED') void refreshMe();
  });
}

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export async function signIn(email: string, password: string) {
  const r = await supabase.auth.signInWithPassword({ email, password });
  fail(r.error);
  await refreshMe();
}

/** Creates the account and signs it in. The server confirms emails itself (no confirmation mail). */
export async function signUp(email: string, password: string, profile: { username?: string; display_name: string; color: string }): Promise<void> {
  const r = await supabase.auth.signUp({ email, password, options: { data: profile } });
  fail(r.error);
  // an existing address comes back without a session (Supabase hides whether it exists)
  if (!r.data.session) throw new Error('This email may already have an account. Log in instead');
  await refreshMe();
}

export async function signOut() {
  await supabase.auth.signOut();
  useAuth.setState({ status: 'signedOut', me: null, error: null });
}

export async function updatePassword(password: string) {
  const r = await supabase.auth.updateUser({ password });
  fail(r.error);
}

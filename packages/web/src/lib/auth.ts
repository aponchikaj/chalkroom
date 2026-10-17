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

/** Returns true when the account still needs its email confirmed before signing in. */
export async function signUp(email: string, password: string, profile: { username?: string; display_name: string; color: string }): Promise<boolean> {
  const r = await supabase.auth.signUp({ email, password, options: { data: profile, emailRedirectTo: `${location.origin}/login` } });
  fail(r.error);
  await refreshMe();
  return !r.data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
  useAuth.setState({ status: 'signedOut', me: null, error: null });
}

/** Email a reset link that lands on /reset/new. */
export async function requestPasswordReset(email: string) {
  const r = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset/new` });
  fail(r.error);
}

export async function updatePassword(password: string) {
  const r = await supabase.auth.updateUser({ password });
  fail(r.error);
}

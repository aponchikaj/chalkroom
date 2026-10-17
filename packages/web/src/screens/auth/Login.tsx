// AU: /login and the login gate. Email and password; when the person was on their way somewhere
// (an invite link or QR code), the page says which class and goes there after signing in.
import { useEffect, useState } from 'react';
import { AlertTriangle, LogIn } from 'lucide-react';
import type { RoomPreview } from '@chalk/schema';
import { api } from '../../lib/api';
import { navigate } from '../../lib/router';
import { signIn, useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { AuthLeaf, ICON, PasswordField, authProblem, goNext, inviteOf, pendingNext, queryNext, safeNext, withNext } from './shared';

export function Login({ next: gateNext }: { next?: string }) {
  const next = gateNext ? safeNext(gateNext) : queryNext();
  const code = inviteOf(next);
  const status = useAuth((s) => s.status);
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    api.preview(code).then((r) => { if (alive) setPreview(r); }).catch(() => { /* the code alone is enough here */ });
    return () => { alive = false; };
  }, [code]);

  // signed in on /login (already, or just now from an email confirmation link): carry on
  useEffect(() => {
    if (!gateNext && status === 'signedIn' && !busy) goNext(safeNext(pendingNext.take() ?? next));
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setUnconfirmed(false); setResent(false);
    try {
      await signIn(email.trim(), password);
      goNext(next);
    } catch (err) {
      setError(authProblem(err));
      setUnconfirmed(/not confirmed/i.test((err as Error).message));
      setBusy(false);
    }
  };

  const resend = async () => {
    const r = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (r.error) setError(authProblem(r.error)); else { setResent(true); pendingNext.set(next); }
  };

  const joining = code ? <>Log in to join {preview ? preview.title : <>the class <span className="mono">{code}</span></>}</> : 'Log in';
  const lede = code
    ? <>{preview?.hostName ? `${preview.hostName} is hosting. ` : ''}Up to five people learn together with an AI tutor. You go straight into the class after logging in.</>
    : 'Your classes, notes and questions are waiting where you left them.';

  return (
    <AuthLeaf title={joining} lede={lede}
      aside={code && <p className="auth-code">Invite code <span className="mono">{code}</span></p>}>
      <form className="entry-form" onSubmit={submit} aria-labelledby="login-title" noValidate>
        <h2 id="login-title">{code ? 'Log in to your account' : 'Log in'}</h2>
        <div className="field">
          <label className="field-label" htmlFor="login-email">Email</label>
          <input id="login-email" className="input input-lg" type="email" value={email} autoComplete="email" autoFocus
            inputMode="email" autoCapitalize="none" spellCheck={false} aria-invalid={!!error || undefined} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password"
          invalid={!!error && !unconfirmed} />
        {error && (
          <div className="errata" role="alert">
            <AlertTriangle {...ICON} aria-hidden />
            <span>{error}{unconfirmed && <> {resent ? 'A new link is on its way.' : <button type="button" className="text-link" onClick={() => void resend()}>Send the link again</button>}</>}</span>
          </div>
        )}
        <button className="btn primary btn-lg" disabled={busy || !email.trim() || !password}>
          {busy ? 'Logging in' : <><LogIn {...ICON} aria-hidden /> Log in</>}
        </button>
        <p className="form-note auth-switch">New to Chalkroom Live? <button type="button" className="text-link" onClick={() => navigate(withNext('/signup', next))}>Create an account</button></p>
      </form>
    </AuthLeaf>
  );
}

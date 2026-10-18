// AU: /login and the login gate. Email and password; when the person was on their way somewhere
// (an invite link or QR code), the page says which class and goes there after signing in.
// An invite link that meets the gate opens Sign up first (most people arriving by a link have
// no account yet), with Log in one tap away.
import { Suspense, lazy, useEffect, useState } from 'react';
import { AlertTriangle, LogIn } from 'lucide-react';
import type { RoomPreview } from '@chalk/schema';
import { api } from '../../lib/api';
import { navigate } from '../../lib/router';
import { signIn, useAuth } from '../../lib/auth';
import { AuthLeaf, AuthMode, ICON, PasswordField, authProblem, goNext, inviteOf, queryNext, safeNext, withNext } from './shared';
import { PageSkeleton } from '../../ui/PageSkeleton';

// Sign up carries the colour picker and its contract (zod); /login loads it only when asked.
const Signup = lazy(() => import('./Signup').then((m) => ({ default: m.Signup })));

export function Login({ next: gateNext }: { next?: string }) {
  const next = gateNext ? safeNext(gateNext) : queryNext();
  const code = inviteOf(next);
  const [mode, setMode] = useState<'signup' | 'login'>(() => (gateNext && code ? 'signup' : 'login'));
  if (mode === 'signup') return <Suspense fallback={<PageSkeleton />}><Signup next={next} onLogIn={() => setMode('login')} /></Suspense>;
  return <LoginForm gateNext={gateNext} next={next} code={code} onSignUp={gateNext && code ? () => setMode('signup') : undefined} />;
}

function LoginForm({ gateNext, next, code, onSignUp }: { gateNext?: string; next: string; code: string | null; onSignUp?: () => void }) {
  const status = useAuth((s) => s.status);
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    let alive = true;
    api.preview(code).then((r) => { if (alive) setPreview(r); }).catch(() => { /* the code alone is enough here */ });
    return () => { alive = false; };
  }, [code]);

  // already signed in on /login: carry on
  useEffect(() => {
    if (!gateNext && status === 'signedIn' && !busy) goNext(safeNext(next));
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await signIn(email.trim(), password);
      goNext(next);
    } catch (err) {
      setError(authProblem(err));
      setBusy(false);
    }
  };

  const joining = code ? <>Log in to join {preview ? preview.title : <>the class <span className="mono">{code}</span></>}</> : 'Welcome back';
  const lede = code
    ? <>{preview?.hostName ? `${preview.hostName} is hosting. ` : ''}Up to five people learn together with an AI tutor. You go straight into the class after logging in.</>
    : 'Your classes, notes and questions are waiting where you left them.';

  return (
    <AuthLeaf title={joining} lede={lede}
      cardNo={code ?? undefined}>
      <form className="entry-form" onSubmit={submit} aria-labelledby="login-title" noValidate>
        {onSignUp && <AuthMode mode="login" onSwitch={onSignUp} />}
        <h2 id="login-title" className={onSignUp ? 'sr-only' : undefined}>{code ? 'Log in to your account' : 'Log in'}</h2>
        <div className="field">
          <label className="field-label" htmlFor="login-email">Email</label>
          <input id="login-email" className="input input-lg" type="email" value={email} autoComplete="email" autoFocus
            inputMode="email" autoCapitalize="none" spellCheck={false} aria-invalid={!!error || undefined} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password"
          invalid={!!error} />
        {error && (
          <div className="errata" role="alert">
            <AlertTriangle {...ICON} aria-hidden />
            <span>{error}</span>
          </div>
        )}
        <button className="btn primary btn-lg" disabled={busy || !email.trim() || !password}>
          {busy ? 'Logging in' : <><LogIn {...ICON} aria-hidden /> Log in</>}
        </button>
        <p className="form-note auth-switch">New to Chalkroom Live? <button type="button" className="text-link" onClick={() => (onSignUp ? onSignUp() : navigate(withNext('/signup', next)))}>Create an account</button></p>
      </form>
    </AuthLeaf>
  );
}

// AU: the second login step (the gate while status is "mfa"). A code from the authenticator app,
// an emailed code, or both on offer. After a passed factor, refreshMe opens the gate.
import { useEffect, useState } from 'react';
import { AlertTriangle, LogOut, Mail, Send, Smartphone } from 'lucide-react';
import type { TwoFactorState } from '@chalk/schema';
import { api, ApiError } from '../../lib/api';
import { refreshMe, signOut, useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { AuthLeaf, CodeInput, ICON, forgetJoined } from './shared';

type Method = 'totp' | 'email';

const codeProblem = (err: unknown) => {
  const m = (err as Error).message?.toLowerCase() ?? '';
  if (/no authenticator/.test(m)) return 'No authenticator app is set up for this account. Use an email code instead.';
  if (err instanceof ApiError && err.status === 429) return 'Too many codes or tries. Wait a few minutes, then send a new code.';
  if (/expired/.test(m)) return 'That code has expired. Send a new one.';
  if (/attempt/.test(m)) return 'Too many wrong tries for this code. Send a new one.';
  if (/invalid|wrong|incorrect|code/.test(m)) return 'That code is not right. Check it and type it again.';
  if (/fetch|network/.test(m)) return 'Could not reach the server. Check your internet connection, then try again.';
  return `${(err as Error).message?.replace(/\.$/, '') || 'Something went wrong'}. Try again.`;
};

export function MfaStep() {
  const me = useAuth((s) => s.me);
  const [state, setState] = useState<TwoFactorState | null>(me?.security ?? null);
  const [method, setMethod] = useState<Method>(me?.security.totp === false && me.security.email2fa ? 'email' : 'totp');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  // /me may have failed with mfa_required: ask the 2FA state directly
  useEffect(() => {
    if (state) return;
    api.twoFactor().then((s) => { setState(s); if (!s.totp && s.email2fa) setMethod('email'); }).catch((e) => setError(codeProblem(e)));
  }, [state]);

  const both = !!state?.totp && !!state?.email2fa;
  const pick = (m: Method) => { setMethod(m); setCode(''); setError(''); };

  const verify = async (c: string) => {
    if (busy || c.length !== 6) return;
    setBusy(true); setError('');
    try {
      if (method === 'totp') {
        const { data, error: e } = await supabase.auth.mfa.listFactors();
        if (e) throw e;
        const factor = data.all.find((f) => f.factor_type === 'totp' && f.status === 'verified');
        if (!factor) throw new Error('No authenticator app is set up for this account. Use an email code instead');
        const r = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: c });
        if (r.error) throw r.error;
      } else {
        await api.emailCodeVerify({ purpose: 'login', code: c });
      }
      await refreshMe();
    } catch (err) {
      setError(codeProblem(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true); setError('');
    try { await api.emailCodeSend({ purpose: 'login' }); setSent(true); } catch (err) { setError(codeProblem(err)); } finally { setBusy(false); }
  };

  const logOut = async () => { forgetJoined(); await signOut(); };
  const email = me?.email;

  return (
    <AuthLeaf title="One more step" lede="Your account asks for a second code at login. It keeps your classes yours even if the password leaks.">
      <form className="entry-form" onSubmit={(e) => { e.preventDefault(); void verify(code); }} aria-labelledby="mfa-title">
        <h2 id="mfa-title">{method === 'totp' ? 'Code from your app' : 'Code by email'}</h2>
        {both && (
          <div className="mfa-methods" role="group" aria-label="Where the code comes from">
            <button type="button" className="btn small" aria-pressed={method === 'totp'} onClick={() => pick('totp')}><Smartphone size={14} aria-hidden /> Authenticator app</button>
            <button type="button" className="btn small" aria-pressed={method === 'email'} onClick={() => pick('email')}><Mail size={14} aria-hidden /> Email code</button>
          </div>
        )}
        {!state && !error && <p className="form-note" role="status">Checking which codes are on</p>}
        {state && method === 'totp' && (
          <>
            <p className="auth-read">Open your authenticator app and type the 6-digit code shown for Chalkroom Live.</p>
            <CodeInput label="6-digit code" value={code} onChange={setCode} onComplete={(c) => void verify(c)} disabled={busy} invalid={!!error} />
          </>
        )}
        {state && method === 'email' && (
          <>
            <p className="auth-read">{sent ? <>We emailed a 6-digit code{email ? <> to <strong className="auth-addr">{email}</strong></> : ''}. It works for 10 minutes.</> : 'We email you a 6-digit code. It works for 10 minutes.'}</p>
            {sent && <CodeInput label="6-digit code" value={code} onChange={setCode} onComplete={(c) => void verify(c)} disabled={busy} invalid={!!error} />}
          </>
        )}
        {error && <div className="errata" role="alert"><AlertTriangle {...ICON} aria-hidden /><span>{error}</span></div>}
        {method === 'email' && !sent ? (
          <button type="button" className="btn primary btn-lg" disabled={busy || !state} onClick={() => void send()}><Send {...ICON} aria-hidden /> {busy ? 'Sending' : 'Email me a code'}</button>
        ) : (
          <button className="btn primary btn-lg" disabled={busy || code.length !== 6}>{busy ? 'Checking' : 'Verify and continue'}</button>
        )}
        <div className="mfa-foot">
          {method === 'email' && sent && <button type="button" className="text-link" disabled={busy} onClick={() => void send()}>Send a new code</button>}
          {email && <span className="mfa-who">Logging in as <strong className="auth-addr">{email}</strong></span>}
          <button type="button" className="btn ghost small" onClick={() => void logOut()}><LogOut size={14} aria-hidden /> Log out</button>
        </div>
      </form>
    </AuthLeaf>
  );
}

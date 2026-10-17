// AU: the second login step (the gate while status is "mfa"): a code from the authenticator app.
// After a passed factor, refreshMe opens the gate. (No email codes: the app sends no email.)
import { useState } from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';
import { refreshMe, signOut, useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { AuthLeaf, CodeInput, ICON, forgetJoined } from './shared';

const codeProblem = (err: unknown) => {
  const m = (err as Error).message?.toLowerCase() ?? '';
  if (/no authenticator/.test(m)) return 'No authenticator app is set up for this account. Log out and ask the host for help.';
  if (/attempt|rate/.test(m)) return 'Too many wrong tries. Wait a minute, then type a fresh code.';
  if (/invalid|wrong|incorrect|code/.test(m)) return 'That code is not right. Check it and type it again.';
  if (/fetch|network/.test(m)) return 'Could not reach the server. Check your internet connection, then try again.';
  return `${(err as Error).message?.replace(/\.$/, '') || 'Something went wrong'}. Try again.`;
};

export function MfaStep() {
  const me = useAuth((s) => s.me);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const verify = async (c: string) => {
    if (busy || c.length !== 6) return;
    setBusy(true); setError('');
    try {
      const { data, error: e } = await supabase.auth.mfa.listFactors();
      if (e) throw e;
      const factor = data.all.find((f) => f.factor_type === 'totp' && f.status === 'verified');
      if (!factor) throw new Error('No authenticator app is set up for this account');
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: c });
      if (r.error) throw r.error;
      await refreshMe();
    } catch (err) {
      setError(codeProblem(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const logOut = async () => { forgetJoined(); await signOut(); };
  const email = me?.email;

  return (
    <AuthLeaf title="One more step" lede="Your account asks for a second code at login. It keeps your classes yours even if the password leaks.">
      <form className="entry-form" onSubmit={(e) => { e.preventDefault(); void verify(code); }} aria-labelledby="mfa-title">
        <h2 id="mfa-title">Code from your app</h2>
        <p className="auth-read">Open your authenticator app and type the 6-digit code shown for Chalkroom Live.</p>
        <CodeInput label="6-digit code" value={code} onChange={setCode} onComplete={(c) => void verify(c)} disabled={busy} invalid={!!error} />
        {error && <div className="errata" role="alert"><AlertTriangle {...ICON} aria-hidden /><span>{error}</span></div>}
        <button className="btn primary btn-lg" disabled={busy || code.length !== 6}>{busy ? 'Checking' : 'Verify and continue'}</button>
        <div className="mfa-foot">
          {email && <span className="mfa-who">Logging in as <strong className="auth-addr">{email}</strong></span>}
          <button type="button" className="btn ghost small" onClick={() => void logOut()}><LogOut size={14} aria-hidden /> Log out</button>
        </div>
      </form>
    </AuthLeaf>
  );
}

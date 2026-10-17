// AU: /reset. Email a reset link. The answer is the same whether or not the account exists.
import { useState } from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { navigate } from '../../lib/router';
import { requestPasswordReset } from '../../lib/auth';
import { AuthLeaf, ICON, authProblem } from './shared';

export function ResetRequest() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await requestPasswordReset(email.trim());
      setSent(email.trim());
    } catch (err) {
      const m = (err as Error).message.toLowerCase();
      // only problems the person can fix are shown; "no such user" never is
      if (/rate limit|security purposes|fetch|network|email address|invalid email/.test(m)) setError(authProblem(err));
      else setSent(email.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLeaf title="Reset your password" lede="Type the email you signed up with. We send a link that lets you choose a new password.">
      {sent ? (
        <div className="entry-form" role="status">
          <h2>Look in your inbox</h2>
          <p className="auth-read">If an account exists for <strong className="auth-addr">{sent}</strong>, a reset link is on its way. It works once and expires after an hour.</p>
          <div className="join-buttons">
            <button type="button" className="btn btn-lg" onClick={() => navigate('/login')}>Back to log in</button>
            <button type="button" className="btn ghost btn-lg" onClick={() => setSent('')}>Use another email</button>
          </div>
        </div>
      ) : (
        <form className="entry-form" onSubmit={submit} aria-labelledby="reset-title">
          <h2 id="reset-title">Send a reset link</h2>
          <div className="field">
            <label className="field-label" htmlFor="reset-email">Email</label>
            <input id="reset-email" className="input input-lg" type="email" value={email} autoComplete="email" inputMode="email" autoCapitalize="none"
              spellCheck={false} autoFocus required onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <div className="errata" role="alert"><AlertTriangle {...ICON} aria-hidden /><span>{error}</span></div>}
          <button className="btn primary btn-lg" disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}>
            {busy ? 'Sending' : <><Send {...ICON} aria-hidden /> Send reset link</>}
          </button>
          <p className="form-note auth-switch">Remembered it? <button type="button" className="text-link" onClick={() => navigate('/login')}>Log in</button></p>
        </form>
      )}
    </AuthLeaf>
  );
}

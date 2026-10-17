// AU: /reset/new. The reset email lands here with a recovery session; choose a new password
// twice, then you are signed in. Without a session the link was used or has expired.
import { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { navigate } from '../../lib/router';
import { updatePassword } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { AuthLeaf, ICON, PasswordField, authProblem, passwordOk } from './shared';

type Link = 'checking' | 'ready' | 'expired';

export function ResetNew() {
  const [link, setLink] = useState<Link>(() => (/error_code=|error=/.test(location.hash + location.search) ? 'expired' : 'checking'));
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (link === 'expired') return;
    let alive = true;
    // getSession waits for the client to read the tokens in the link
    void supabase.auth.getSession().then(({ data }) => { if (alive) setLink(data.session && !data.session.user.is_anonymous ? 'ready' : 'expired'); });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY' && alive) setLink('ready'); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mismatch = !!again && again !== password;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true); setError('');
    if (!passwordOk(password) || password !== again) return;
    setBusy(true);
    try {
      await updatePassword(password);
      navigate('/', true);
    } catch (err) {
      setError(authProblem(err));
      setBusy(false);
    }
  };

  if (link === 'expired') {
    return (
      <AuthLeaf title="This link has expired" lede="Reset links work once and only for an hour. Ask for a fresh one; it takes a few seconds.">
        <div className="entry-form">
          <h2>Get a new link</h2>
          <button type="button" className="btn primary btn-lg" onClick={() => navigate('/reset', true)}>Send a new reset link</button>
          <p className="form-note auth-switch">Remembered the password? <button type="button" className="text-link" onClick={() => navigate('/login', true)}>Log in</button></p>
        </div>
      </AuthLeaf>
    );
  }

  return (
    <AuthLeaf title="Choose a new password" lede="After saving it you are logged in on this device.">
      {link === 'checking' ? (
        <p className="form-note" role="status">Opening the reset link</p>
      ) : (
        <form className="entry-form" onSubmit={submit} aria-labelledby="newpw-title" noValidate>
          <h2 id="newpw-title">New password</h2>
          <PasswordField id="newpw" label="New password" value={password} onChange={setPassword} autoComplete="new-password" rule autoFocus invalid={tried && !passwordOk(password)} />
          <PasswordField id="newpw-again" label="Type it again" value={again} onChange={setAgain} autoComplete="new-password" invalid={(tried || again.length >= password.length) && mismatch} />
          {again && !mismatch && passwordOk(password) && <p className="field-note ok-text"><Check size={13} strokeWidth={3} aria-hidden /> The two match.</p>}
          {(tried || again.length >= password.length) && mismatch && <p className="error-text">The two passwords are different.</p>}
          {error && <div className="errata" role="alert"><AlertTriangle {...ICON} aria-hidden /><span>{error}</span></div>}
          <button className="btn primary btn-lg" disabled={busy}>{busy ? 'Saving' : 'Save and log in'}</button>
        </form>
      )}
    </AuthLeaf>
  );
}

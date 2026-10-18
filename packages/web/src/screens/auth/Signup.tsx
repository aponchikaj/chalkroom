// AU: /signup. Name and colour (how the class sees you), an optional username, email and a
// password with its rule. The account is signed in straight away (no confirmation email).
import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { MEMBER_COLORS, type RoomPreview } from '@chalk/schema';
import { api } from '../../lib/api';
import { navigate } from '../../lib/router';
import { signUp } from '../../lib/auth';
import { ProfileFields } from '../../components/ProfileFields';
import { AuthLeaf, AuthMode, ICON, PasswordField, authProblem, goNext, inviteOf, passwordOk, queryNext, withNext } from './shared';

const USERNAME = /^[A-Za-z0-9_]{3,24}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const randomColor = () => MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)];

/** `next` and `onLogIn` come from the login gate (an invite link): Sign up shows first there. */
export function Signup({ next: gateNext, onLogIn }: { next?: string; onLogIn?: () => void } = {}) {
  const next = gateNext ?? queryNext();
  const code = inviteOf(next);
  const [profile, setProfile] = useState(() => ({ name: '', color: randomColor() as string }));
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<RoomPreview | null>(null);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    api.preview(code).then((r) => { if (alive) setPreview(r); }).catch(() => { /* the code alone is enough here */ });
    return () => { alive = false; };
  }, [code]);

  const user = username.trim();
  const userBad = !!user && !USERNAME.test(user);
  const emailBad = !EMAIL.test(email.trim());
  const nameBad = !profile.name.trim();
  const pwBad = !passwordOk(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true); setError('');
    if (nameBad || userBad || emailBad || pwBad) return;
    setBusy(true);
    try {
      const addr = email.trim();
      await signUp(addr, password, { username: user || undefined, display_name: profile.name.trim(), color: profile.color });
      goNext(next);
    } catch (err) {
      setError(authProblem(err));
      setBusy(false);
    }
  };


  return (
    <AuthLeaf title={code ? <>Sign up to join {preview ? preview.title : <>the class <span className="mono">{code}</span></>}</> : 'Make an account'}
      lede={code
        ? <>{preview?.hostName ? `${preview.hostName} is hosting. ` : ''}One account for every class: the class sees your name and colour, and you go straight into the class after signing up.</>
        : 'One account for every class: the class sees your name and colour, and your notes and questions stay with you.'}
      cardNo={code ?? undefined}>
      <form className="entry-form" onSubmit={submit} aria-labelledby="signup-title" noValidate>
        {onLogIn && <AuthMode mode="signup" onSwitch={onLogIn} />}
        <h2 id="signup-title" className={onLogIn ? 'sr-only' : undefined}>Sign up</h2>
        <ProfileFields value={profile} onChange={setProfile} idPrefix="signup" nameLabel="Display name" invalid={tried && nameBad} />
        {tried && nameBad && <p className="error-text" id="signup-name-error">Type the name the class should see.</p>}
        <div className="field">
          <label className="field-label" htmlFor="signup-username">Username <span className="field-hint">optional, for your profile link</span></label>
          <input id="signup-username" className="input" value={username} maxLength={24} autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder="e.g. nika_k" aria-invalid={userBad || undefined} aria-describedby="signup-username-hint" onChange={(e) => setUsername(e.target.value)} />
          <p id="signup-username-hint" className={userBad ? 'error-text' : 'field-note'}>3 to 24 letters, digits or _. Empty: made from your email.</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="signup-email">Email</label>
          <input id="signup-email" className="input input-lg" type="email" value={email} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
            aria-invalid={(tried && emailBad) || undefined} onChange={(e) => setEmail(e.target.value)} />
          {tried && emailBad && <p className="error-text">Type the email address you can open: the reset link goes there.</p>}
        </div>
        <PasswordField id="signup-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" rule invalid={tried && pwBad} />
        {error && <div className="errata" role="alert"><AlertTriangle {...ICON} aria-hidden /><span>{error}</span></div>}
        <button className="btn primary btn-lg" disabled={busy}>
          {busy ? 'Making your account' : <>Sign up <ArrowRight {...ICON} aria-hidden /></>}
        </button>
        <p className="form-note auth-switch">Already have an account? <button type="button" className="text-link" onClick={() => (onLogIn ? onLogIn() : navigate(withNext('/login', next)))}>Log in</button></p>
      </form>
    </AuthLeaf>
  );
}

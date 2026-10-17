// AS: Security: change the password, and two-step sign-in with an authenticator app (Supabase
// MFA, TOTP) or with codes sent to the account email (our API, purpose enable / disable).
import { useEffect, useState } from 'react';
import { Check, Copy, Circle, KeyRound, Mail } from 'lucide-react';
import type { MeRes, TwoFactorState } from '@chalk/schema';
import { api } from '../../lib/api';
import { refreshMe, updatePassword } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { Done, Errata, ICON, say } from './parts';

export function SecuritySection({ me }: { me: MeRes }) {
  return (
    <section className="acct-section" aria-labelledby="acct-security-title">
      <h2 id="acct-security-title">Security</h2>
      <p className="acct-lede">Your password, and a second step at sign-in.</p>
      <PasswordForm email={me.email} />
      <TwoFactor initial={me.security} />
    </section>
  );
}

const RULES = [
  { text: 'At least 10 characters', ok: (p: string) => p.length >= 10 },
  { text: 'Lower and upper case letters', ok: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { text: 'At least one digit', ok: (p: string) => /\d/.test(p) },
];

function PasswordForm({ email }: { email: string | null }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [tried, setTried] = useState(false);
  const meets = RULES.every((r) => r.ok(pw));
  const same = pw === again;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true); setDone(false); setError('');
    if (!meets || !same) return;
    setBusy(true);
    try {
      await updatePassword(pw);
      setPw(''); setAgain(''); setTried(false); setDone(true);
    } catch (err) { setError(say(err, 'Your password did not change. Try again.')); } finally { setBusy(false); }
  };

  return (
    <form className="acct-block acct-form" onSubmit={submit} noValidate aria-labelledby="acct-pw-title">
      <h3 id="acct-pw-title" className="acct-subhead"><KeyRound {...ICON} aria-hidden />Password</h3>
      {/* lets password managers file the new password under the right account */}
      <input type="email" name="username" autoComplete="username" value={email ?? ''} readOnly hidden />
      <div className="acct-two">
        <div className="field">
          <label className="field-label" htmlFor="acct-pw">New password</label>
          <input id="acct-pw" className="input" type="password" autoComplete="new-password" value={pw}
            aria-invalid={tried && !meets} aria-describedby="acct-pw-rules" onChange={(e) => { setPw(e.target.value); setDone(false); }} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="acct-pw2">New password again</label>
          <input id="acct-pw2" className="input" type="password" autoComplete="new-password" value={again}
            aria-invalid={tried && !same} aria-describedby={tried && !same ? 'acct-pw2-err' : undefined} onChange={(e) => { setAgain(e.target.value); setDone(false); }} />
          {tried && !same && <span id="acct-pw2-err" className="error-text">The two passwords are not the same.</span>}
        </div>
      </div>
      <ul className="acct-rules" id="acct-pw-rules">
        {RULES.map((r) => {
          const ok = r.ok(pw);
          return (
            <li key={r.text} className={ok ? 'met' : tried ? 'unmet' : ''}>
              {ok ? <Check size={14} strokeWidth={2.5} aria-hidden /> : <Circle size={14} strokeWidth={2} aria-hidden />}
              {r.text}<span className="sr-only">{ok ? ', done' : ', not yet'}</span>
            </li>
          );
        })}
      </ul>
      {error && <Errata onDismiss={() => setError('')}>{error}</Errata>}
      <div className="acct-actions">
        <button className="btn primary" disabled={busy || !pw || !again}>{busy ? 'Changing' : 'Change password'}</button>
        {done && <Done>Password changed. Use it the next time you sign in.</Done>}
      </div>
    </form>
  );
}

/** Supabase hands the QR as SVG text (sometimes already behind a data: prefix); make it a safe <img> source. */
const qrSrc = (qr: string) => {
  let svg = qr.startsWith('data:') ? qr.slice(qr.indexOf(',') + 1) : qr;
  if (!svg.trimStart().startsWith('<')) { try { svg = decodeURIComponent(svg); } catch { /* already plain */ } }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};
const groupSecret = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();
const CODE = /^\d{6}$/;
const cleanCode = (s: string) => s.replace(/\D/g, '').slice(0, 6);

type Totp = { step: 'idle' } | { step: 'busy' } | { step: 'enroll'; factorId: string; qr: string; secret: string } | { step: 'confirmRemove' };
type Mailer = { step: 'idle' } | { step: 'sending' } | { step: 'code'; purpose: 'enable' | 'disable' };

function TwoFactor({ initial }: { initial: TwoFactorState }) {
  const [state, setState] = useState<TwoFactorState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [totp, setTotp] = useState<Totp>({ step: 'idle' });
  const [mail, setMail] = useState<Mailer>({ step: 'idle' });
  const [code, setCode] = useState('');
  const [mailCode, setMailCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ where: 'totp' | 'mail'; text: string } | null>(null);
  const [done, setDone] = useState<{ where: 'totp' | 'mail'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoadError('');
    try { setState(await api.twoFactor()); } catch (e) { setLoadError(say(e, 'Could not read your sign-in steps.')); setState((s) => s ?? initial); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (where: 'totp' | 'mail', e: unknown, fallback?: string) => setError({ where, text: say(e, fallback) });

  // ---- authenticator app ----
  const startTotp = async () => {
    setError(null); setDone(null); setCode(''); setTotp({ step: 'busy' });
    try {
      // an unfinished setup from before would block a new one
      const list = await supabase.auth.mfa.listFactors();
      if (list.error) throw new Error(list.error.message);
      for (const f of list.data.all) if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const r = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' });
      if (r.error) throw new Error(r.error.code === 'mfa_totp_enroll_not_enabled' ? 'Authenticator apps are not switched on for this server yet' : r.error.message);
      setTotp({ step: 'enroll', factorId: r.data.id, qr: qrSrc(r.data.totp.qr_code), secret: r.data.totp.secret });
    } catch (e) { setTotp({ step: 'idle' }); fail('totp', e, 'Could not start the setup. Try again.'); }
  };
  const cancelTotp = async () => {
    if (totp.step === 'enroll') void supabase.auth.mfa.unenroll({ factorId: totp.factorId });
    setTotp({ step: 'idle' }); setCode(''); setError(null);
  };
  const verifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totp.step !== 'enroll' || !CODE.test(code)) return;
    setBusy(true); setError(null);
    try {
      const r = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.factorId, code });
      if (r.error) throw new Error(/invalid|expired/i.test(r.error.message) ? 'That code did not match. Codes change every 30 seconds; type the one showing now' : r.error.message);
      setTotp({ step: 'idle' }); setCode('');
      await load(); await refreshMe();
      setDone({ where: 'totp', text: 'Authenticator app on. You will be asked for a code from it when you sign in.' });
    } catch (err) { fail('totp', err); } finally { setBusy(false); }
  };
  const removeTotp = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const list = await supabase.auth.mfa.listFactors();
      if (list.error) throw new Error(list.error.message);
      for (const f of list.data.totp) {
        const r = await supabase.auth.mfa.unenroll({ factorId: f.id });
        if (r.error) throw new Error(/aal2/i.test(r.error.message) ? 'Sign in again with your authenticator code first, then remove it' : r.error.message);
      }
      setTotp({ step: 'idle' });
      await load(); await refreshMe();
      setDone({ where: 'totp', text: 'Authenticator app removed.' });
    } catch (err) { setTotp({ step: 'idle' }); fail('totp', err); } finally { setBusy(false); }
  };
  const copySecret = async (secret: string) => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };

  // ---- email codes ----
  const sendMail = async (purpose: 'enable' | 'disable') => {
    setError(null); setDone(null); setMailCode(''); setMail({ step: 'sending' });
    try {
      await api.emailCodeSend({ purpose });
      setMail({ step: 'code', purpose });
    } catch (e) { setMail({ step: 'idle' }); fail('mail', e, 'The code was not sent. Try again.'); }
  };
  const verifyMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mail.step !== 'code' || !CODE.test(mailCode)) return;
    setBusy(true); setError(null);
    try {
      const s = await api.emailCodeVerify({ purpose: mail.purpose, code: mailCode });
      setState(s);
      setDone({ where: 'mail', text: mail.purpose === 'enable' ? 'Email codes on. Each sign-in sends a code to your email.' : 'Email codes off.' });
      setMail({ step: 'idle' }); setMailCode('');
      await refreshMe();
    } catch (err) { fail('mail', err, 'That code did not work.'); } finally { setBusy(false); }
  };

  if (!state) {
    return (
      <div className="acct-block" aria-busy="true">
        <h3 className="acct-subhead">Two-step sign-in</h3>
        <p className="acct-note" role="status">Reading your sign-in steps</p>
        <div className="acct-factor" aria-hidden><span className="acct-sk acct-sk-title" /><span className="acct-sk acct-sk-switch" /></div>
        <div className="acct-factor" aria-hidden><span className="acct-sk acct-sk-title" /><span className="acct-sk acct-sk-switch" /></div>
      </div>
    );
  }

  const anyOn = state.totp || state.email2fa;
  const stamp = (on: boolean) => <span className={`stamp ${on ? 'stamp-ok' : 'stamp-muted'}`}>{on ? 'On' : 'Off'}</span>;

  return (
    <div className="acct-block" role="group" aria-labelledby="acct-2fa-title">
      <h3 id="acct-2fa-title" className="acct-subhead">Two-step sign-in</h3>
      <p className="acct-note">
        {anyOn ? 'After your password, you also give a code.' : 'Off. Add a second step so a stolen password is not enough to get in.'}
        {' '}There are no recovery codes: if you lose every second step, you need support to get back in.
      </p>
      {loadError && <Errata onDismiss={() => setLoadError('')}>{loadError}</Errata>}

      <div className="acct-factor">
        <div className="acct-factor-head">
          <span className="acct-factor-name"><KeyRound {...ICON} aria-hidden />Authenticator app</span>
          {stamp(state.totp)}
        </div>
        <p className="acct-note">A 6-digit code from an app such as Google Authenticator, 1Password or Aegis.</p>

        {totp.step === 'enroll' ? (
          <form className="acct-enroll" onSubmit={verifyTotp} noValidate>
            <img className="acct-qr" src={totp.qr} width={176} height={176} alt="QR code to scan with your authenticator app" />
            <div className="acct-enroll-side">
              <ol className="acct-steps">
                <li>Scan the code with your authenticator app.</li>
                <li>Or type this key into the app:</li>
              </ol>
              <div className="acct-secret">
                <code className="mono" aria-label="Setup key">{groupSecret(totp.secret)}</code>
                <button type="button" className="btn small" onClick={() => copySecret(totp.secret)}>
                  {copied ? <><Check size={14} aria-hidden />Copied</> : <><Copy size={14} aria-hidden />Copy</>}
                </button>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="acct-totp-code">Code from the app</label>
                <input id="acct-totp-code" className="input mono acct-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  placeholder="000000" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} autoFocus />
              </div>
              <div className="acct-actions">
                <button className="btn primary" disabled={busy || !CODE.test(code)}>{busy ? 'Checking' : 'Turn on'}</button>
                <button type="button" className="btn" onClick={cancelTotp} disabled={busy}>Cancel</button>
              </div>
            </div>
          </form>
        ) : totp.step === 'confirmRemove' ? (
          <div className="acct-confirm" role="group" aria-label="Remove the authenticator app">
            <p>Remove the authenticator app? {state.email2fa ? 'Email codes stay on.' : 'Signing in will only need your password.'}</p>
            <div className="acct-actions">
              <button type="button" className="btn danger" onClick={removeTotp} disabled={busy}>{busy ? 'Removing' : 'Remove'}</button>
              <button type="button" className="btn" onClick={() => setTotp({ step: 'idle' })} disabled={busy}>Keep it</button>
            </div>
          </div>
        ) : (
          <div className="acct-actions">
            {state.totp
              ? <button type="button" className="btn" onClick={() => { setDone(null); setTotp({ step: 'confirmRemove' }); }}>Remove</button>
              : <button type="button" className="btn" onClick={startTotp} disabled={totp.step === 'busy'}>{totp.step === 'busy' ? 'Preparing' : 'Set up'}</button>}
          </div>
        )}
        {error?.where === 'totp' && <Errata onDismiss={() => setError(null)}>{error.text}</Errata>}
        {done?.where === 'totp' && <Done>{done.text}</Done>}
      </div>

      <div className="acct-factor">
        <div className="acct-factor-head">
          <span className="acct-factor-name"><Mail {...ICON} aria-hidden />Email codes</span>
          {stamp(state.email2fa)}
        </div>
        <p className="acct-note">A 6-digit code sent to your account email each time you sign in.</p>
        {mail.step === 'code' ? (
          <form className="acct-form" onSubmit={verifyMail} noValidate>
            <p className="acct-note">We sent a code to your email. It works for 10 minutes. Type it to turn email codes {mail.purpose === 'enable' ? 'on' : 'off'}.</p>
            <div className="field">
              <label className="field-label" htmlFor="acct-mail-code">Code from the email</label>
              <input id="acct-mail-code" className="input mono acct-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                placeholder="000000" value={mailCode} onChange={(e) => setMailCode(cleanCode(e.target.value))} autoFocus />
            </div>
            <div className="acct-actions">
              <button className="btn primary" disabled={busy || !CODE.test(mailCode)}>{busy ? 'Checking' : mail.purpose === 'enable' ? 'Turn on' : 'Turn off'}</button>
              <button type="button" className="btn" onClick={() => { setMail({ step: 'idle' }); setError(null); }} disabled={busy}>Cancel</button>
              <button type="button" className="text-link" onClick={() => sendMail(mail.purpose)} disabled={busy}>Send a new code</button>
            </div>
          </form>
        ) : (
          <div className="acct-actions">
            <button type="button" className="btn" disabled={mail.step === 'sending'} onClick={() => sendMail(state.email2fa ? 'disable' : 'enable')}>
              {mail.step === 'sending' ? 'Sending a code' : state.email2fa ? 'Turn off' : 'Turn on'}
            </button>
          </div>
        )}
        {error?.where === 'mail' && <Errata onDismiss={() => setError(null)}>{error.text}</Errata>}
        {done?.where === 'mail' && <Done>{done.text}</Done>}
      </div>
    </div>
  );
}

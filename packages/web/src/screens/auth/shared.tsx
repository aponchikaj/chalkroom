// AU: parts shared by the account pages: the leaf they sit on, the password field with its rule,
// the one-time-code input, where to go after signing in, and Supabase errors in plain words.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Circle, Eye, EyeOff } from 'lucide-react';
import { navigate } from '../../lib/router';
import '../../ui/ui.css';
import '../entry.css';
import './auth.css';

export const ICON = { size: 16, strokeWidth: 2 } as const;

/** One manual leaf: the running head, the title side, and the form on a library card tucked
 *  into the leaf. `cardNo` prints in the card's number box (an invite code, for example); the
 *  card's foot is ruled like a date-due slip. */
export function AuthLeaf({ title, lede, aside, children, wide, cardNo }: {
  title: ReactNode; lede?: ReactNode; aside?: ReactNode; children: ReactNode; wide?: boolean; cardNo?: ReactNode;
}) {
  return (
    <main className="entry">
      <article className="manual leaf punched page-fill auth-manual">
        <header className="manual-head">
          <button type="button" className="btn ghost small manual-back" onClick={() => navigate('/')}><ArrowLeft {...ICON} aria-hidden /> Chalkroom Live</button>
          <span className="manual-meta auth-meta">Live classes for up to five people</span>
        </header>
        <div className={`manual-body auth-body ${wide ? 'auth-wide' : ''}`}>
          <section className="title-block auth-title" aria-live="polite">
            <h1 className="display display-room">{title}</h1>
            {lede && <p className="lede">{lede}</p>}
            {aside}
          </section>
          <div className="auth-side">
            <div className="library-card">
              <div className="lc-head">
                <span className="lc-brand" aria-hidden>Chalkroom Live</span>
                <span className="lc-kind" aria-hidden>Library card</span>
                {cardNo && <span className="lc-no"><span aria-hidden>No. </span><span className="sr-only">Invite code </span><span className="mono">{cardNo}</span></span>}
              </div>
              {children}
              <div className="lc-due" aria-hidden>
                <span className="lc-due-head">Date due</span><span className="lc-due-head">Class</span>
                <span className="lc-due-cell" /><span className="lc-due-cell" />
                <span className="lc-due-cell" /><span className="lc-due-cell" />
              </div>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}

/** On an invite link: Sign up first, Log in second, as two keys at the top of the card. The
 *  pressed key names the form, so the form's own heading is for screen readers only. */
export function AuthMode({ mode, onSwitch }: { mode: 'signup' | 'login'; onSwitch: () => void }) {
  const key = (m: 'signup' | 'login', words: string) => (
    <button type="button" className="auth-mode-key" aria-pressed={mode === m} onClick={() => { if (mode !== m) onSwitch(); }}>{words}</button>
  );
  return (
    <div className="auth-mode" role="group" aria-label="Account">
      {key('signup', 'New here: sign up')}
      {key('login', 'I have an account: log in')}
    </div>
  );
}

// ---------- where to go next ----------

/** Only same-site paths: never an absolute URL or a protocol-relative "//host". */
export function safeNext(s: string | null | undefined): string {
  return s && s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/login') ? s : '/';
}
export const queryNext = () => safeNext(new URLSearchParams(location.search).get('next'));
export const withNext = (path: string, next: string) => (next && next !== '/' ? `${path}?next=${encodeURIComponent(next)}` : path);
export const inviteOf = (next: string) => /^\/r\/([A-Za-z0-9]+)/.exec(next)?.[1].toUpperCase() ?? null;

/** Go on after signing in. When the gate is already showing that path it re-renders by itself. */
export function goNext(next: string) {
  if (location.pathname + location.hash !== next) navigate(next, true);
}

/** Forget the rooms the last person joined so the next one on this browser is not pulled in. */
export function forgetJoined() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('chalkroom.joined.')) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}

// ---------- errors ----------

export function authProblem(err: unknown): string {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email or password is wrong.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Log in instead.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Too many tries in a short time. Wait a minute, then try again.';
  if (m.includes('password')) return 'The password does not meet the rule: at least 10 characters with lowercase and uppercase letters and a digit.';
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('email address')) return 'That email address does not look right. Check it and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the sign-in server. Check your internet connection, then try again.';
  return `${(err as Error)?.message?.replace(/\.$/, '') || 'Something went wrong'}. Try again.`;
}

// ---------- password ----------

const RULES = [
  { test: (p: string) => p.length >= 10, words: '10 or more characters' },
  { test: (p: string) => /[a-z]/.test(p), words: 'a lowercase letter' },
  { test: (p: string) => /[A-Z]/.test(p), words: 'an uppercase letter' },
  { test: (p: string) => /\d/.test(p), words: 'a digit' },
];
export const passwordOk = (p: string) => RULES.every((r) => r.test(p));

/** Password input with a show/hide key. `rule` adds the checklist under it (new passwords). */
export function PasswordField({ id, label, value, onChange, autoComplete, rule, invalid, autoFocus, labelAside }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password'; rule?: boolean; invalid?: boolean; autoFocus?: boolean;
  /** shown at the end of the label row, e.g. a "Forgot password?" link */
  labelAside?: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const hint = `${id}-rule`;
  return (
    <div className="field">
      <div className="auth-label-row">
        <label className="field-label" htmlFor={id}>{label}</label>
        {labelAside}
      </div>
      <div className="pw-row">
        <input id={id} className="input input-lg" type={shown ? 'text' : 'password'} value={value} autoComplete={autoComplete}
          autoFocus={autoFocus} spellCheck={false} autoCapitalize="none" aria-invalid={invalid || undefined}
          aria-describedby={rule ? hint : undefined} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn ghost icon-btn pw-toggle" aria-pressed={shown} aria-controls={id}
          aria-label={shown ? 'Hide password' : 'Show password'} title={shown ? 'Hide password' : 'Show password'} onClick={() => setShown((s) => !s)}>
          {shown ? <EyeOff {...ICON} aria-hidden /> : <Eye {...ICON} aria-hidden />}
        </button>
      </div>
      {rule && (
        <ul className="pw-rule" id={hint} aria-label="The password needs">
          {RULES.map((r) => {
            const ok = r.test(value);
            return (
              <li key={r.words} className={ok ? 'ok' : ''}>
                {ok ? <Check size={13} strokeWidth={3} aria-hidden /> : <Circle size={11} strokeWidth={2} aria-hidden />}
                {r.words}<span className="sr-only">{ok ? ', done' : ', still missing'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- one-time code ----------

/** Six digits. One input so a pasted "123 456" or an OS autofill lands whole. */
export function CodeInput({ value, onChange, onComplete, label, disabled, invalid, autoFocus = true }: {
  value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; label: string;
  disabled?: boolean; invalid?: boolean; autoFocus?: boolean;
}) {
  const id = useId();
  useEffect(() => { if (value.length === 6) onComplete?.(value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="input code-input otp-input" value={value} inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9]{6}" maxLength={12} placeholder="000000" autoFocus={autoFocus} readOnly={disabled} aria-busy={disabled || undefined} aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
    </div>
  );
}

// AS: small pieces the account sections share: plain-words errors, the errata slip, the saved
// line, an on/off switch and the person's punch with their picture.
import type { ReactNode } from 'react';
import { CircleAlert, Check } from 'lucide-react';
import { ApiError } from '../../lib/api';

export const ICON = { size: 16, strokeWidth: 2 } as const;

/** A failed request in the product's words. */
export function say(err: unknown, fallback = 'That did not work. Try again.'): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many tries in a short time. Wait a minute, then try again.';
    if (err.status >= 500) return 'The server had a problem. Try again in a moment.';
    if (err.message) return sentence(err.message);
    return fallback;
  }
  if (err instanceof TypeError) return 'Could not reach the server. Check your internet connection, then try again.';
  if (err instanceof Error && err.message) return sentence(err.message);
  return fallback;
}
const sentence = (m: string) => { const t = m.trim().replace(/\.$/, ''); return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`; };

export function Errata({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <p className="errata acct-errata" role="alert">
      <CircleAlert size={16} strokeWidth={2} aria-hidden />
      <span className="grow">{children}</span>
      {onDismiss && <button type="button" className="text-link acct-dismiss" onClick={onDismiss}>Dismiss</button>}
    </p>
  );
}

/** A success or state line in words; the icon only reinforces. */
export function Done({ children }: { children: ReactNode }) {
  return <p className="acct-done" role="status"><Check size={14} strokeWidth={2.5} aria-hidden />{children}</p>;
}

/** An on/off switch printed as a two-position key; the state reads in words. */
export function Switch({ id, checked, onChange, disabled, labelledBy, describedBy }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; labelledBy: string; describedBy?: string;
}) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-labelledby={labelledBy} aria-describedby={describedBy}
      className="acct-switch" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="acct-switch-pos" data-on={!checked}>Off</span>
      <span className="acct-switch-pos" data-on={checked}>On</span>
    </button>
  );
}

/** The person as a punched hole ringed in their colour, with their picture when they have one. */
export function Portrait({ name, color, src, size = 88 }: { name: string; color: string; src?: string | null; size?: number }) {
  return (
    <span className="acct-portrait" style={{ ['--who' as string]: color, ['--d' as string]: `${size}px` }} aria-hidden>
      {src ? <img src={src} alt="" /> : <span>{(name.trim() || '?').slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

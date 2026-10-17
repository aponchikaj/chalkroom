// A person in the class, drawn as a punched hole on the binding edge, ringed in their colour.
// State reads in words for assistive tech; the marks are lucide icons.
import { ArrowUpRight, Check, MessageSquareOff } from 'lucide-react';

export interface PunchProps {
  name: string;
  color: string;
  present?: boolean;
  host?: boolean;
  ready?: boolean;
  inThread?: boolean;
  /** the host muted them: they cannot ask */
  muted?: boolean;
  me?: boolean;
  size?: 'sm' | 'md';
}

export function Punch({ name, color, present = true, host, ready, inThread, muted, me, size = 'md' }: PunchProps) {
  const states = [me && 'you', host && 'host', !present && 'away', ready && 'ready', inThread && 'in a thread', muted && 'muted'].filter(Boolean).join(', ');
  return (
    <span className={`punch punch-${size} ${present ? '' : 'away'}`} style={{ ['--who' as string]: color }} title={`${name}${states ? ` (${states})` : ''}`}>
      <span className="punch-hole" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>
      {(ready || inThread || muted) && (
        <span className="punch-mark" aria-hidden>
          {muted ? <MessageSquareOff size={10} strokeWidth={2.5} /> : inThread ? <ArrowUpRight size={11} strokeWidth={2.5} /> : <Check size={11} strokeWidth={3} />}
        </span>
      )}
      {host && <span className="punch-host" aria-hidden>H</span>}
      <span className="sr-only">{name}{states ? `, ${states}` : ''}</span>
    </span>
  );
}

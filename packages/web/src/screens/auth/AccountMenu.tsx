// AU: who is signed in (their punch and name) with a small menu: Account, Your classes, Replays, Log out.
// Used on Home's running head and in the classroom masthead.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Library, LogOut, CirclePlay, UserRound } from 'lucide-react';
import { signOut, useAuth } from '../../lib/auth';
import { navigate } from '../../lib/router';
import { Punch } from '../../ui/Punch';
import { forgetJoined } from './shared';
import './auth.css';

export function AccountMenu({ onClasses }: { onClasses?: () => void }) {
  const me = useAuth((s) => s.me);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = () => [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    items()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[n]?.focus();
    };
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', away);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away); };
  }, [open]);

  if (!me) return null;
  const name = me.profile.display_name || me.profile.username;
  const go = (f: () => void) => () => { setOpen(false); f(); };

  return (
    <div className="acct" ref={wrap}>
      <button ref={trigger} type="button" className="acct-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls="acct-menu"
        aria-label={`Signed in as ${name}. Account menu`} onClick={() => setOpen((o) => !o)}>
        <Punch name={name} color={me.profile.color} size="sm" />
        <span className="acct-name">{name}</span>
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden className="acct-chev" />
      </button>
      {open && (
        <div id="acct-menu" className="acct-menu step-in" role="menu" aria-label="Account">
          <p className="acct-head">
            <span className="acct-head-name">{name}</span>
            {me.email && <span className="acct-head-email">{me.email}</span>}
          </p>
          <button role="menuitem" type="button" className="acct-item" onClick={go(() => navigate('/account'))}><UserRound size={15} aria-hidden /> Account</button>
          <button role="menuitem" type="button" className="acct-item" onClick={go(onClasses ?? (() => navigate('/#classes')))}><Library size={15} aria-hidden /> Your classes</button>
          <button role="menuitem" type="button" className="acct-item" onClick={go(() => navigate('/replays'))}><CirclePlay size={15} aria-hidden /> Replays</button>
          <button role="menuitem" type="button" className="acct-item" onClick={go(() => { forgetJoined(); void signOut().then(() => navigate('/', true)); })}><LogOut size={15} aria-hidden /> Log out</button>
        </div>
      )}
    </div>
  );
}

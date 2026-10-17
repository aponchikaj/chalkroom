// B6 host moderation (Dev A UI): the host opens a person on the binding edge to mute, unmute
// or remove them. Removing is final for this class (they cannot rejoin), so it asks first,
// inline. Never offered on the host's own punch.
import { useEffect, useRef, useState } from 'react';
import { MessageSquare, MessageSquareOff, UserX } from 'lucide-react';
import type { MemberRow } from '@chalk/schema';
import { useRoom } from '../../room/store';
import { api } from '../../lib/api';
import './people.css';

const ICON = { size: 14, strokeWidth: 2.25 } as const;

export function ModerateMenu({ member, onClose }: { member: MemberRow; onClose: () => void }) {
  const roomId = useRoom((s) => s.room!.id);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // close on Escape or a click elsewhere
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const away = (e: PointerEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', away);
    ref.current?.querySelector('button')?.focus();
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away); };
  }, [onClose]);

  const act = (action: 'mute' | 'unmute' | 'kick') => {
    setBusy(true);
    setError('');
    api.moderate(roomId, { userId: member.user_id, action })
      .then(onClose)
      .catch((e) => setError(`${(e as Error).message}. Try again.`))
      .finally(() => setBusy(false));
  };

  return (
    <div ref={ref} className="moderate step-in" role="menu" aria-label={`Moderate ${member.display_name}`}>
      <p className="moderate-name">{member.display_name}</p>
      {!confirm ? (
        <>
          {member.muted
            ? <button role="menuitem" className="btn small" disabled={busy} onClick={() => act('unmute')}><MessageSquare {...ICON} aria-hidden />Let them ask</button>
            : <button role="menuitem" className="btn small" disabled={busy} onClick={() => act('mute')}><MessageSquareOff {...ICON} aria-hidden />Mute questions</button>}
          <button role="menuitem" className="btn small danger" disabled={busy} onClick={() => setConfirm(true)}><UserX {...ICON} aria-hidden />Remove from class</button>
        </>
      ) : (
        <>
          <p className="moderate-warn">Remove {member.display_name}? They leave now and cannot rejoin this class.</p>
          <div className="row">
            <button className="btn small danger" disabled={busy} onClick={() => act('kick')}>{busy ? 'Removing' : 'Remove'}</button>
            <button className="btn small ghost" disabled={busy} onClick={() => setConfirm(false)}>Keep</button>
          </div>
        </>
      )}
      {error && <p className="errata" role="alert">{error}</p>}
    </div>
  );
}

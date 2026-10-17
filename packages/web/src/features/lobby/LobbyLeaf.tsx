// A7 (Dev A): the lobby leaf over the board while people arrive: the invite code at display
// scale, a QR code, Copy link, a share line for Discord / Telegram, and who is here.
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useShallow } from 'zustand/react/shallow';
import { Check, Copy, Share2 } from 'lucide-react';
import { selectActiveMembers, selectPresentMembers, selectIsHost, useRoom } from '../../room/store';
import { Punch } from '../../ui/Punch';
import './lobby.css';
import { nameFor } from '../../lib/text';

const ICON = { size: 16, strokeWidth: 2 } as const;

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function LobbyLeaf() {
  const room = useRoom((s) => s.room)!;
  const isHost = useRoom(selectIsHost);
  const me = useRoom((s) => s.me);
  const members = useRoom(useShallow(selectActiveMembers));
  const presence = useRoom((s) => s.presence);
  const here = useRoom((s) => selectPresentMembers(s).length);
  const host = members.find((m) => m.user_id === room.host_id);
  const url = `${location.origin}/r/${room.invite_code}`;
  const shareText = `Join my Chalkroom Live class "${room.title}": ${url} (code ${room.invite_code})`;
  const [qr, setQr] = useState('');
  const [done, setDone] = useState<'' | 'link' | 'share' | 'failed'>('');
  const timer = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 0, width: 360, color: { dark: '#1b1a17', light: '#fbf8f1' } })
      .then((d) => { if (alive) setQr(d); }).catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [url]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (v: typeof done) => {
    setDone(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(''), 2400);
  };
  const copyLink = async () => flash((await copy(url)) ? 'link' : 'failed');
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: room.title, text: shareText, url }); return; } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    flash((await copy(shareText)) ? 'share' : 'failed');
  };
  const open = Math.max(0, room.seats - members.length);

  return (
    <div className="board-overlay lobby-overlay">
      <section className="lobby leaf hinge-in" aria-label="Invite people">
        <div className="lobby-main">
          <h2 className="lobby-title">{room.title}</h2>
          <p className="lobby-lede">
            {isHost ? 'Share the code or the QR code. Up to five people in one class.' : `You are in. ${host ? host.display_name : 'The host'} starts the class when everyone is here.`}
          </p>
          <div className="lobby-code">
            <span className="lobby-code-label">Invite code</span>
            <code className="lobby-code-value" aria-label={`Invite code ${room.invite_code.split('').join(' ')}`}>{room.invite_code}</code>
          </div>
          <div className="lobby-actions">
            <button className="btn primary" onClick={copyLink}>
              {done === 'link' ? <Check {...ICON} aria-hidden /> : <Copy {...ICON} aria-hidden />}
              {done === 'link' ? 'Link copied' : 'Copy link'}
            </button>
            <button className="btn" onClick={share}>
              {done === 'share' ? <Check {...ICON} aria-hidden /> : <Share2 {...ICON} aria-hidden />}
              {done === 'share' ? 'Invite text copied' : 'Share invite'}
            </button>
          </div>
          <p className="lobby-share-line" role="status">
            {done === 'failed' ? <span className="error-text">Copy did not work here. Select the link below and copy it by hand.</span>
              : done === 'share' ? 'Paste it into Discord or Telegram.'
              : 'Share invite opens your phone\'s share sheet, or copies a ready line for Discord or Telegram.'}
          </p>
          <p className="lobby-url mono">{url}</p>
        </div>

        <figure className="lobby-qr">
          {qr ? <img src={qr} alt={`QR code that opens ${url}`} width={180} height={180} /> : <span className="lobby-qr-blank">QR code unavailable. Use the link.</span>}
          <figcaption>Scan with a phone camera to join</figcaption>
        </figure>

        <div className="lobby-people">
          <h3 className="section-title">Here now, <span className="mono">{here}/{room.seats}</span></h3>
          <ul>
            {members.map((m) => (
              <li key={m.user_id} className="step-in">
                <Punch name={m.display_name} color={m.color} me={m.user_id === me} host={m.user_id === room.host_id} present={!!presence[m.user_id]} />
                <span>{nameFor(m.user_id, m.display_name, me)}</span>
              </li>
            ))}
            {Array.from({ length: open }, (_, i) => (
              <li key={`open${i}`} className="lobby-open"><span className="binding-ring" aria-hidden /><span>Open seat</span></li>
            ))}
          </ul>
          <p className="lobby-next">
            {isHost ? 'Press Start class in the bar below when everyone is here.' : 'Waiting for the host to start. The board fills in on its own.'}
          </p>
        </div>
      </section>
    </div>
  );
}

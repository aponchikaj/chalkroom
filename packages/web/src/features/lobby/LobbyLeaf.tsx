import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { selectIsHost, useRoom } from '../../room/store';

// A7 (Dev A): the lobby leaf over the board while people arrive: invite link, QR code, who is
// here. Starting point only; A7 owns the design (plus a share card for Discord / Telegram).
export function LobbyLeaf() {
  const room = useRoom((s) => s.room)!;
  const isHost = useRoom(selectIsHost);
  const url = `${location.origin}/r/${room.invite_code}`;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr).catch(() => setQr('')); }, [url]);

  return (
    <div className="board-overlay"><div className="leaf col" style={{ alignItems: 'center', textAlign: 'center' }}>
      <h2>{room.title}</h2>
      <p className="muted">{isHost ? 'Share the link. Press Start class when everyone is here.' : 'Waiting for the host to start the class…'}</p>
      {qr && <img src={qr} alt={`QR code for ${url}`} width={180} height={180} className="qr" />}
      <div className="row">
        <code className="invite">{room.invite_code}</code>
        <button className="btn small" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
    </div></div>
  );
}

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { selectIsHost, useRoom } from '../room/store';

/** Lobby: invite link + QR code while people arrive. */
export function LobbyOverlay() {
  const room = useRoom((s) => s.room)!;
  const isHost = useRoom(selectIsHost);
  const url = `${location.origin}/r/${room.invite_code}`;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr).catch(() => setQr('')); }, [url]);

  return (
    <div className="gate">
      <h2>{room.title}</h2>
      <p className="muted">{isHost ? 'Share the link. Press Start class when everyone is here.' : 'Waiting for the host to start the class…'}</p>
      {qr && <img src={qr} alt={`QR code for ${url}`} width={180} height={180} className="qr" />}
      <div className="row">
        <code className="invite">{room.invite_code}</code>
        <button className="btn small" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      {/* TODO(frontend): share card for Discord / Telegram */}
    </div>
  );
}

/** After the class: recap entry point.
 *  TODO(frontend): Recap screen — shared notes, your questions + answers, cards, book next session. */
export function EndedOverlay() {
  return (
    <div className="gate">
      <h2>Class ended</h2>
      <p className="muted">Shared notes and your flashcards will appear here.</p>
    </div>
  );
}

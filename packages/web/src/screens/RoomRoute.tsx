// /r/:code — pre-join (name, colour), then the classroom. A browser that already joined this
// room goes straight back in after a refresh.
import { useEffect, useState } from 'react';
import type { RoomPreview } from '@chalk/schema';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { joined, loadProfile, saveProfile, type Profile } from '../lib/profile';
import { ProfileFields } from '../components/ProfileFields';
import { Classroom } from './Classroom';

export function RoomRoute({ code }: { code: string }) {
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [profile, setProfile] = useState(loadProfile);
  const [entered, setEntered] = useState<{ roomId: string; profile: Profile } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const join = async (p: Profile) => {
    setBusy(true); setError('');
    try {
      saveProfile(p);
      const { room } = await api.joinRoom({ inviteCode: code, displayName: p.name, color: p.color });
      joined.add(code);
      setEntered({ roomId: room.id, profile: p });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    api.preview(code).then(setPreview).catch((e) => setError((e as Error).message));
    const p = loadProfile();
    if (joined.has(code) && p.name) void join(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (entered) return <Classroom roomId={entered.roomId} profile={entered.profile} />;

  return (
    <div className="page-scroll">
      <form className="card col prejoin" onSubmit={(e) => { e.preventDefault(); void join(profile); }}>
        <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => navigate('/')}>← Home</button>
        {preview ? (
          <>
            <h2>{preview.title}</h2>
            <p className="muted">Host: {preview.hostName || '—'} · {preview.taken}/{preview.seats} seats · {preview.phase === 'lobby' ? 'starting soon' : preview.phase === 'ended' ? 'ended' : 'in progress'}</p>
          </>
        ) : !error && <p className="muted">Loading room {code}…</p>}
        {/* TODO(frontend): mic test + "join muted" (design doc, Pre-join screen) */}
        <ProfileFields value={profile} onChange={setProfile} />
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary" disabled={busy || !profile.name.trim() || !preview}>{busy ? 'Joining…' : 'Join class'}</button>
      </form>
    </div>
  );
}

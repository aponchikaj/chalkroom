// Home: start a class or join one by code.
// TODO(frontend, P2): lobby of open public rooms + community course catalog.
import { useState } from 'react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { joined, loadProfile, saveProfile } from '../lib/profile';
import { ProfileFields } from '../components/ProfileFields';

export function Home() {
  const [profile, setProfile] = useState(loadProfile);
  const [title, setTitle] = useState('Solana PDAs');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      saveProfile(profile);
      const { room } = await api.createRoom({ title, displayName: profile.name, color: profile.color });
      joined.add(room.invite_code);
      navigate(`/r/${room.invite_code}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-scroll">
      <div className="home">
        <header className="home-head">
          <h1 className="brand">Chalkroom Live</h1>
          <p className="muted">A live class taught by an AI tutor on a shared whiteboard. Up to five people. Ask anything, anytime.</p>
        </header>
        <div className="grid-2">
          <form className="card col" onSubmit={create}>
            <h2>Start a class</h2>
            <label className="col">
              <span className="section-title">What do you want to learn?</span>
              <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <ProfileFields value={profile} onChange={setProfile} />
            {error && <p className="error-text">{error}</p>}
            <button className="btn primary" disabled={busy || !title.trim() || !profile.name.trim()}>{busy ? 'Creating…' : 'Create room'}</button>
          </form>
          <form className="card col" onSubmit={(e) => { e.preventDefault(); navigate(`/r/${code.trim().toUpperCase()}`); }}>
            <h2>Join a class</h2>
            <label className="col">
              <span className="section-title">Invite code</span>
              <input className="input code-input" value={code} maxLength={12} placeholder="ABC123" onChange={(e) => setCode(e.target.value)} />
            </label>
            <button className="btn" disabled={code.trim().length < 4}>Continue</button>
          </form>
        </div>
      </div>
    </div>
  );
}

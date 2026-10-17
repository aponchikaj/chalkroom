// A7 (Dev A): Home, the manual's title page. What Chalkroom Live is in one line, how a class
// runs as the table of contents, and the two ways in: start a class, or join with a code.
// TODO(frontend, P2): lobby of open public rooms + community course catalog.
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { joined, loadProfile, saveProfile } from '../lib/profile';
import { ProfileFields } from '../components/ProfileFields';
import { sectionHue, sectionInk } from '../ui/section';
import { describe } from './entry';
import '../ui/ui.css';
import './entry.css';

const CONTENTS = [
  ['Start', 'Name a topic. You get an invite code, a link and a QR code.'],
  ['Join', 'Up to five people open the link, type a name and pick a colour. No signup.'],
  ['Learn', 'The tutor draws on one shared board and talks you through it, in short segments.'],
  ['Ask', 'Type, or hold Space to talk. Similar questions are grouped into one answer.'],
  ['Check', 'A quick check, then everyone marks ready and the class moves on together.'],
  ['Notes', 'Shared notes and your questions with their answers when the class ends.'],
] as const;

const ICON = { size: 16, strokeWidth: 2 } as const;
const cleanCode = (s: string) => s.replace(/[^a-z0-9]/gi, '').toUpperCase();

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
      const { room } = await api.createRoom({ title: title.trim(), displayName: profile.name.trim(), color: profile.color });
      joined.add(room.invite_code);
      navigate(`/r/${room.invite_code}`);
    } catch (err) {
      setError(describe(err, 'create').text);
    } finally {
      setBusy(false);
    }
  };
  const c = cleanCode(code);

  return (
    <div className="entry">
      <article className="manual leaf punched">
        <header className="manual-head">
          <span className="manual-brand">Chalkroom Live</span>
          <span className="manual-meta">Live classes for up to five people</span>
        </header>

        <div className="manual-body home-body">
          <section className="title-block" aria-labelledby="home-title">
            <h1 id="home-title" className="display">Learn it live, together.</h1>
            <p className="lede">An AI tutor teaches your group on one shared whiteboard. Anyone can ask at any time, and the class keeps moving.</p>
          </section>

          <section className="contents-block" id="contents" aria-labelledby="contents-title">
          <h2 id="contents-title" className="contents-head">How a class runs</h2>
          <ol className="contents">
            {CONTENTS.map(([name, text], i) => (
              <li key={name}>
                <span className="contents-tab" style={{ background: sectionHue(i), color: sectionInk(i) }}><span className="mono">{i + 1}</span></span>
                <span className="contents-name">{name}</span>
                <span className="contents-text">{text}</span>
              </li>
            ))}
          </ol>
          </section>

          <div className="entry-forms">
            <form id="start" className="entry-form" onSubmit={create} aria-labelledby="start-title">
              <h2 id="start-title">Start a class</h2>
              <div className="field">
                <label className="field-label" htmlFor="topic">What do you want to learn?</label>
                <input id="topic" className="input input-lg" value={title} maxLength={80} placeholder="A topic, e.g. Solana PDAs" onChange={(e) => setTitle(e.target.value)} />
              </div>
              <ProfileFields value={profile} onChange={setProfile} autoFocus={false} idPrefix="home" />
              {error && <p className="errata" role="alert">{error}</p>}
              <button className="btn primary btn-lg" disabled={busy || !title.trim() || !profile.name.trim()}>
                {busy ? 'Opening the room' : <>Start a class <ArrowRight {...ICON} aria-hidden /></>}
              </button>
              <p className="form-note">You become the host. Share the code, then press Start class when everyone is in.</p>
            </form>

            <form id="join" className="entry-form join-form" aria-labelledby="join-title"
              onSubmit={(e) => { e.preventDefault(); if (c.length >= 4) navigate(`/r/${c}`); }}>
              <h2 id="join-title">Join with a code</h2>
              <div className="field">
                <label className="field-label" htmlFor="code">Invite code</label>
                <div className="join-row">
                  <input id="code" className="input code-input" value={code} maxLength={14} placeholder="KPXCNK" autoComplete="off" autoCapitalize="characters" spellCheck={false}
                    onChange={(e) => setCode(e.target.value.toUpperCase())} />
                  <button className="btn" disabled={c.length < 4}>Find class</button>
                </div>
              </div>
              <p className="form-note">Got a link instead? Open it; it brings you straight to the class.</p>
            </form>
          </div>
        </div>

        <nav className="fore-tabs" aria-label="Sections">
          <a href="#start" style={{ background: sectionHue(0), color: sectionInk(0) }}>Start</a>
          <a href="#join" style={{ background: sectionHue(1), color: sectionInk(1) }}>Join</a>
          <a href="#contents" style={{ background: sectionHue(2), color: sectionInk(2) }}>Contents</a>
        </nav>
      </article>
      <footer className="entry-foot">Hacktoberfest Georgia 2026, by GeoSafety. Voice plays on your own device, with captions.</footer>
    </div>
  );
}

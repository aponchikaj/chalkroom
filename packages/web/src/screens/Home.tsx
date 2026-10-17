// A7 (Dev A): Home, the manual's title page. The big title, then four divider tabs on the fore
// edge that switch the leaf: start a class, join with a code, your classes, how a class runs.
// TODO(frontend, P2): lobby of open public rooms + community course catalog.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { joined, loadProfile, saveProfile } from '../lib/profile';
import { ProfileFields } from '../components/ProfileFields';
import { sectionHue, sectionInk } from '../ui/section';
import { describe } from './entry';
import { MyClasses, useMyClasses } from './home/MyClasses';
import '../ui/ui.css';
import './entry.css';
import './home/home.css';

const CONTENTS = [
  ['Start', 'Name a topic. You get an invite code, a link and a QR code.'],
  ['Join', 'Up to five people open the link, type a name and pick a colour. No signup.'],
  ['Learn', 'The tutor draws on one shared board and talks you through it, in short segments.'],
  ['Ask', 'Type a question at any time, or select a shape on the board to pin it there. Similar questions are grouped into one answer.'],
  ['Check', 'A quick check, then everyone marks ready and the class moves on together.'],
  ['Notes', 'Shared notes and your questions with their answers when the class ends.'],
] as const;

const TABS = [
  { id: 'start', label: 'Start' },
  { id: 'join', label: 'Join' },
  { id: 'classes', label: 'Your classes' },
  { id: 'how', label: 'How it works' },
] as const;
type Tab = (typeof TABS)[number]['id'];
const isTab = (s: string | null | undefined): s is Tab => TABS.some((t) => t.id === s);

const TAB_KEY = 'chalkroom.homeTab';
const storedTab = (): Tab | null => {
  try { const t = localStorage.getItem(TAB_KEY); return isTab(t) ? t : null; } catch { return null; }
};
const storeTab = (t: Tab) => { try { localStorage.setItem(TAB_KEY, t); } catch { /* storage blocked */ } };
const hashTab = (): Tab | null => { const h = location.hash.slice(1).toLowerCase(); return isTab(h) ? h : null; };
/** A first guess before the class list loads: has this browser joined any room? */
const joinedBefore = () => {
  try { for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('chalkroom.joined.')) return true; } catch { /* blocked */ }
  return false;
};

const PHONE = '(max-width: 760px)';
const usePhone = () => useSyncExternalStore((l) => {
  const m = matchMedia(PHONE); m.addEventListener('change', l); return () => m.removeEventListener('change', l);
}, () => matchMedia(PHONE).matches);

const ICON = { size: 16, strokeWidth: 2 } as const;
const cleanCode = (s: string) => s.replace(/[^a-z0-9]/gi, '').toUpperCase();

export function Home() {
  const [profile, setProfile] = useState(loadProfile);
  const [title, setTitle] = useState('Solana PDAs');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { load, reload } = useMyClasses();
  // an explicit choice (deep link or remembered tab) wins; otherwise the default follows the class list
  const [chosen, setChosen] = useState<Tab | null>(() => hashTab() ?? storedTab());
  const fallback: Tab = load.status === 'ready' ? (load.classes.length ? 'classes' : 'start') : joinedBefore() ? 'classes' : 'start';
  const tab = chosen ?? fallback;
  const phone = usePhone();
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const onHash = () => { const t = hashTab(); if (t) setChosen(t); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const select = (t: Tab, focus = false) => {
    setChosen(t);
    storeTab(t);
    if (location.hash) history.replaceState(null, '', `#${t}`);
    if (focus) tabRefs.current[t]?.focus();
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(TABS[(next + TABS.length) % TABS.length].id, true);
  };

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
  const hue = TABS.findIndex((t) => t.id === tab);

  return (
    <div className="entry">
      <article className="manual leaf punched home-manual">
        <div className="home-tabs" role="tablist" aria-label="Home" aria-orientation={phone ? 'horizontal' : 'vertical'} onKeyDown={onTabKey}>
          {TABS.map((t, i) => (
            <button key={t.id} type="button" role="tab" id={`home-tab-${t.id}`} aria-controls="home-panel"
              aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              className="home-tab" style={{ ['--hue' as string]: sectionHue(i), ['--on-hue' as string]: sectionInk(i) }}
              onClick={() => select(t.id)}>
              <span className="home-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        <header className="manual-head">
          <span className="manual-brand">Chalkroom Live</span>
          <span className="manual-meta">Live classes for up to five people</span>
        </header>

        <div className="manual-body home-body">
          <section className="title-block" aria-labelledby="home-title">
            <h1 id="home-title" className="display">Learn it live, together.</h1>
            <p className="lede">An AI tutor teaches your group on one shared whiteboard. Anyone can ask at any time, and the class keeps moving.</p>
          </section>

          <div id="home-panel" className="home-panel" role="tabpanel" aria-labelledby={`home-tab-${tab}`} tabIndex={0}
            style={{ ['--hue' as string]: sectionHue(hue) }}>
            {tab === 'start' && (
              <form className="entry-form home-section" onSubmit={create} aria-labelledby="start-title">
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
            )}

            {tab === 'join' && (
              <form className="entry-form home-section" aria-labelledby="join-title"
                onSubmit={(e) => { e.preventDefault(); if (c.length >= 4) navigate(`/r/${c}`); }}>
                <h2 id="join-title">Join with a code</h2>
                <div className="field">
                  <label className="field-label" htmlFor="code">Invite code</label>
                  <div className="join-row">
                    <input id="code" className="input code-input" value={code} maxLength={14} placeholder="KPXCNK" autoComplete="off" autoCapitalize="characters" spellCheck={false}
                      onChange={(e) => setCode(e.target.value.toUpperCase())} />
                    <button className="btn primary" disabled={c.length < 4}>Find class</button>
                  </div>
                </div>
                <p className="form-note">Got a link instead? Open it; it brings you straight to the class.</p>
              </form>
            )}

            {tab === 'classes' && <MyClasses load={load} reload={reload} onSwitch={(t) => select(t, true)} />}

            {tab === 'how' && (
              <section className="home-section" aria-labelledby="contents-title">
                <h2 id="contents-title">How a class runs</h2>
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
            )}
          </div>
        </div>
      </article>
      <footer className="entry-foot">Hacktoberfest Georgia 2026, by GeoSafety. The tutor's voice plays on your own device, with captions.</footer>
    </div>
  );
}

// A7 (Dev A), lane P: Home, the notebook's contents page. The title, then a contents list with
// dotted leaders and page numbers; divider tabs on the fore edge switch the leaf: start a class,
// join with a code, the lobby of open public classes, the course catalog, your classes, how a
// class runs. Replays are the last entry of the contents. Right after a class, a slip on the
// contents points to that class's page.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { navigate } from '../lib/router';
import { transition } from '../ui/motion';
import { AccountMenu } from './auth/AccountMenu';
import { sectionHue, sectionInk } from '../ui/section';
import { MyClasses, useMyClasses } from './home/MyClasses';
import { StartForm } from './home/StartForm';
import { Lobby } from './home/Lobby';
import { Courses } from './home/Courses';
import { REPLAYS, TABS, type Tab } from './home/contents';
import '../ui/ui.css';
import './entry.css';
import './home/home.css';
// Last on purpose: PhoneNav pulls in entry.css, which must not jump ahead of this page's stylesheets.
import { PhoneNav } from '../ui/PhoneNav';

const CONTENTS = [
  ['Start', 'Name a topic. You get an invite code, a link and a QR code.'],
  ['Join', 'Up to five people open the link or scan the QR code and log in. The class sees your name and colour.'],
  ['Learn', 'The tutor draws on one shared board and talks you through it, in short segments.'],
  ['Ask', 'Type a question at any time, or select a shape on the board to pin it there. Similar questions are grouped into one answer.'],
  ['Check', 'A quick check, then everyone marks ready and the class moves on together.'],
  ['Notes', 'Shared notes and your questions with their answers when the class ends.'],
] as const;

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

const useMedia = (q: string) => useSyncExternalStore((l) => {
  const m = matchMedia(q); m.addEventListener('change', l); return () => m.removeEventListener('change', l);
}, () => matchMedia(q).matches);
const PHONE = '(max-width: 760px)';
/** below this width the contents list sits above the panel instead of beside it */
const NARROW = '(max-width: 1080px)';

const cleanCode = (s: string) => s.replace(/[^a-z0-9]/gi, '').toUpperCase();

/** A class that ended this recently counts as "just finished" on Home. */
const JUST_MS = 3 * 60 * 60 * 1000;
const seenKey = (id: string) => `chalkroom.finishedSeen.${id}`;
const wasSeen = (id: string) => { try { return sessionStorage.getItem(seenKey(id)) === '1'; } catch { return false; } };
const markSeen = (id: string) => { try { sessionStorage.setItem(seenKey(id), '1'); } catch { /* storage blocked */ } };

const go = (path: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(path);
};

export function Home() {
  const [code, setCode] = useState('');
  const { load, reload } = useMyClasses();
  // an explicit choice (deep link or remembered tab) wins; otherwise the default follows the class list
  const [chosen, setChosen] = useState<Tab | null>(() => hashTab() ?? storedTab());
  const fallback: Tab = load.status === 'ready' ? (load.classes.length ? 'classes' : 'start') : joinedBefore() ? 'classes' : 'start';
  const tab = chosen ?? fallback;
  const phone = useMedia(PHONE);
  const narrow = useMedia(NARROW);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const onHash = () => { const t = hashTab(); if (t) setChosen(t); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // the most recent class that ended in the last few hours, until it is opened or dismissed
  const [dismissed, setDismissed] = useState<string | null>(null);
  const finished = useMemo(() => {
    if (load.status !== 'ready') return null;
    const now = Date.now();
    const recent = load.classes
      .filter((c) => c.room.phase === 'ended' && c.room.ended_at && now - Date.parse(c.room.ended_at) < JUST_MS)
      .sort((a, b) => Date.parse(b.room.ended_at!) - Date.parse(a.room.ended_at!))[0];
    return recent && !wasSeen(recent.room.id) ? recent.room : null;
  }, [load]);
  const showFinished = finished && finished.id !== dismissed ? finished : null;

  const select = (t: Tab, focus = false) => {
    void transition(() => setChosen(t));
    storeTab(t);
    if (location.hash) history.replaceState(null, '', `#${t}`);
    if (focus) tabRefs.current[t]?.focus();
    // phones: when the page was scrolled past the tabs, the new section opens at its top
    if (phone) requestAnimationFrame(() => {
      const panel = panelRef.current;
      const pinned = document.querySelector('.home-tabs')?.getBoundingClientRect().bottom ?? 0;
      if (panel && panel.getBoundingClientRect().top < pinned) panel.scrollIntoView({ block: 'start' });
    });
  };

  // on a narrow leaf the panel sits below the contents: bring it into view
  const fromContents = (t: Tab) => {
    select(t);
    if (narrow) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(TABS[(next + TABS.length) % TABS.length].id, true);
  };

  const c = cleanCode(code);
  const hue = TABS.findIndex((t) => t.id === tab);

  return (
    <main className="entry">
      <PhoneNav current={`home:${tab}`} />
      <article className="manual leaf punched home-manual page-fill">
        <div className="home-tabs" role="tablist" aria-label="Home" aria-orientation={phone ? 'horizontal' : 'vertical'} onKeyDown={onTabKey}>
          {TABS.map((t, i) => (
            <button key={t.id} type="button" role="tab" id={`home-tab-${t.id}`} aria-controls="home-panel"
              aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              className="home-tab" style={{ ['--hue' as string]: sectionHue(i), ['--on-hue' as string]: sectionInk(i) }}
              onClick={() => select(t.id)}>
              <span className="home-tab-label">{phone ? t.short : t.label}</span>
            </button>
          ))}
        </div>

        <header className="manual-head pn-hide">
          <span className="manual-brand">Chalkroom Live</span>
          <span className="manual-meta home-meta">Live classes for up to five people</span>
          <AccountMenu onClasses={() => select('classes', true)} phoneMenu={false} />
        </header>

        <div className="manual-body home-body" data-tab={tab}>
          <section className="title-block home-title" aria-labelledby="home-title">
            <h1 id="home-title" className="display">Learn it live, together.</h1>
            <p className="lede">An AI tutor teaches your group on one shared whiteboard. Anyone can ask at any time, and the class keeps moving.</p>

            {showFinished && (
              <p className="finished-slip note-in" role="status">
                <span className="finished-text">
                  You just finished <strong>{showFinished.title || 'a class'}</strong>:{' '}
                  <a className="text-link" href={`/c/${showFinished.id}`} onClick={(e) => { markSeen(showFinished.id); go(`/c/${showFinished.id}`)(e); }}>
                    open the class page
                  </a>
                </span>
                <button type="button" className="btn ghost icon-btn finished-close" aria-label="Dismiss" title="Dismiss"
                  onClick={() => { markSeen(showFinished.id); setDismissed(showFinished.id); }}>
                  <X size={16} strokeWidth={2} aria-hidden />
                </button>
              </p>
            )}

            <nav className="toc" aria-labelledby="toc-title">
              <h2 id="toc-title" className="toc-title">Contents</h2>
              <ol className="toc-list">
                {TABS.map((t, i) => (
                  <li key={t.id}>
                    <button type="button" className="toc-entry" aria-current={tab === t.id ? 'true' : undefined}
                      aria-controls="home-panel" onClick={() => fromContents(t.id)} style={{ ['--hue' as string]: sectionHue(i) }}>
                      <span className="toc-name">{t.entry}</span>
                      <span className="toc-leader" aria-hidden />
                      <span className="toc-page mono" aria-hidden>{i + 1}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <a className="toc-entry toc-away" href={REPLAYS.path} onClick={go(REPLAYS.path)}>
                    <span className="toc-name">{REPLAYS.entry}</span>
                    <span className="toc-leader" aria-hidden />
                    <span className="toc-page" aria-hidden><ArrowRight size={15} strokeWidth={2} /></span>
                  </a>
                </li>
              </ol>
            </nav>
          </section>

          <div id="home-panel" ref={panelRef} className="home-panel" role="tabpanel" aria-labelledby={`home-tab-${tab}`} tabIndex={0}
            style={{ ['--hue' as string]: sectionHue(hue) }}>
            {tab === 'start' && <StartForm />}

            {tab === 'join' && (
              <form className="entry-form home-section" aria-labelledby="join-title"
                onSubmit={(e) => { e.preventDefault(); if (c.length >= 4) navigate(`/r/${c}`); }}>
                <h2 id="join-title">Join with a code</h2>
                <div className="field">
                  <label className="field-label" htmlFor="code">Invite code</label>
                  <div className="join-row">
                    <input id="code" className="input code-input" value={code} maxLength={14} placeholder="KPXCNK" autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="go"
                      onChange={(e) => setCode(e.target.value.toUpperCase())} />
                    <button className="btn primary" disabled={c.length < 4}>Find class</button>
                  </div>
                </div>
                <p className="form-note">Got a link instead? Open it; it brings you straight to the class.</p>
              </form>
            )}

            {tab === 'lobby' && <Lobby onSwitch={(t) => select(t, true)} />}

            {tab === 'courses' && <Courses />}

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
        <footer className="entry-foot">The tutor's voice plays on your own device, with captions.</footer>
      </article>
    </main>
  );
}

// The landing page for signed-out visitors at "/": a composition notebook lying open on the
// desk. Fore-edge divider tabs are the navigation; the hero is the real board replaying the
// demo lesson (silently, see HeroClass and demoLesson). The optional three.js intro was removed: it did
// not read better than the 2D hero, and its models were not Draco-packed as the plan asks. Honest copy only: no numbers except product
// limits, and nothing the product does not do.
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { navigate } from '../../lib/router';
import { prefersReducedMotion } from '../../ui/motion';
import { useCurrentSection } from './hooks';
import { HeroClass } from './HeroClass';
import { sectionHue, sectionInk } from '../../ui/section';
import { QuestionsSection, ThreadsSection, AfterSection, BuiltSection } from './Sections';
import './landing.css';
// Last on purpose: PhoneNav pulls in entry.css, which must not jump ahead of this page's stylesheets.
import { PhoneNav } from '../../ui/PhoneNav';

const SECTIONS = [
  { id: 'start', tab: 'Start', hue: '--h-orange', on: 'var(--ink)' },
  { id: 'questions', tab: 'Questions', hue: '--h-teal', on: '#fff' },
  { id: 'threads', tab: 'Threads', hue: '--h-grass', on: '#fff' },
  { id: 'after', tab: 'After class', hue: '--h-ultra', on: '#fff' },
  { id: 'built', tab: 'How it is built', hue: '--h-violet', on: '#fff' },
  { id: 'join', tab: 'Join', hue: '--h-sienna', on: '#fff' },
] as const;
const IDS = SECTIONS.map((s) => s.id);

/** The hero picture: the live 2D class. */
function HeroVisual() {
  return (
    <div className="ld-hero-visual">
      <HeroClass />
    </div>
  );
}

/** Jump to a section: smooth unless motion is reduced, then focus its heading for keyboard and screen readers. */
function goTo(id: string, e?: MouseEvent) {
  const el = document.getElementById(id);
  if (!el) return;
  e?.preventDefault();
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const h = el.querySelector<HTMLElement>('h1, h2');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  history.replaceState(null, '', `#${id}`);
}

/** Pull a room code out of what was typed or pasted: a bare code or a whole invite link. */
function codeFrom(raw: string): string {
  const fromLink = /\/r\/([A-Za-z0-9]+)/.exec(raw);
  return (fromLink ? fromLink[1] : raw).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function JoinForm({ id }: { id: string }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const code = codeFrom(value);
    // the same rule the API checks (live.ts joinRoom.inviteCode: 4 to 12 characters), kept as a
    // plain length check so the signed-out first route never downloads zod
    if (code.length < 4 || code.length > 12) {
      setError(code ? 'Invite codes are 4 to 12 letters and numbers, like KPXCNK.' : 'Type the code from your invite, like KPXCNK.');
      document.getElementById(id)?.focus();
      return;
    }
    navigate(`/r/${code}`);
  };
  return (
    <form className="ld-join" onSubmit={submit} noValidate>
      <label htmlFor={id}>Have an invite code?</label>
      <input id={id} className="input mono" value={value} placeholder="KPXCNK" autoComplete="off" spellCheck={false}
        autoCapitalize="characters" inputMode="text" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => { setValue(e.target.value); if (error) setError(''); }} />
      <button className="btn" type="submit">Join</button>
      {error && <p className="error-text" id={`${id}-err`} role="alert">{error}</p>}
    </form>
  );
}

function StartButton() {
  return (
    <a className="btn primary ld-start" href="/signup?next=/" onClick={(e) => { e.preventDefault(); navigate('/signup?next=/'); }}>
      Start a class <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
    </a>
  );
}

export default function Landing() {
  const current = useCurrentSection(IDS);
  const tabsRef = useRef<HTMLElement>(null);
  // phones: the tabs run across the top; keep the current one in view
  useEffect(() => {
    const nav = tabsRef.current;
    const tab = nav?.querySelector<HTMLElement>('a[aria-current="true"]');
    if (!nav || !tab || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: tab.offsetLeft - 12, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [current]);
  const login = (e: MouseEvent) => { e.preventDefault(); navigate('/login'); };

  return (
    <div className="ld">
      <PhoneNav banner groups={[{ title: 'Sections', rows: SECTIONS.map((s, i) => ({
        key: `landing:${s.id}`, label: s.tab, run: () => goTo(s.id), hue: sectionHue(i), onHue: sectionInk(i),
        page: <span className="mono">{i + 1}</span>, current: current === s.id,
      })) }]} action={<a className="pn-action" href="/login" onClick={login}>Log in</a>} />
      <div className="ld-book">
        <nav className="ld-tabs pn-hide" aria-label="Sections" ref={tabsRef}>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} onClick={(e) => goTo(s.id, e)} aria-current={current === s.id ? 'true' : undefined}
                  style={{ ['--hue' as string]: `var(${s.hue})`, ['--on-hue' as string]: s.on }}>{s.tab}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="ld-page page-fill">
          <header className="ld-head pn-hide">
            <span className="ld-brand">Chalkroom Live</span>
            <nav aria-label="Account">
              <a className="ld-nav-wide" href="#questions" onClick={(e) => goTo('questions', e)}>How it works</a>
              <a className="ld-nav-wide" href="#join-code" onClick={(e) => { e.preventDefault(); document.getElementById('join-code')?.focus(); }}>Join with a code</a>
              <a href="/login" onClick={login}>Log in</a>
            </nav>
          </header>

          <main>
            <section className="ld-hero" id="start" aria-labelledby="ld-title" style={{ ['--section' as string]: 'var(--h-orange)' }}>
              <div className="ld-hero-copy">
                <h1 id="ld-title" className="ld-h1">
                  Five seats.<br />One board.<br />No one left<br />
                  <span className="ld-under">behind.
                    <svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden><path d="M2 12 C 60 4, 120 16, 180 9 S 270 6, 298 11" pathLength={1} /></svg>
                  </span>
                </h1>
                <p className="ld-lede">An AI tutor teaches your group live on a shared whiteboard. Ask at any time: similar questions become one answer for the class, and a deep dive gets its own tutor while the class keeps moving.</p>
                <div className="ld-cta">
                  <StartButton />
                  <JoinForm id="join-code" />
                  <p className="ld-fine">You need a free account. The host picks a topic and gets a link and a QR code to share.</p>
                </div>
              </div>
              <HeroVisual />
            </section>

            <QuestionsSection />
            <ThreadsSection />
            <AfterSection />
            <BuiltSection />

            <section className="ld-sect ld-close" id="join" aria-labelledby="ld-join-title" style={{ ['--section' as string]: 'var(--h-sienna)' }}>
              <div>
                <h2 id="ld-join-title">Pull up four chairs.</h2>
                <p className="ld-read">Five seats to a class: you and up to four others. Start one, share the link, and learn it together at one pace.</p>
                <p className="ld-hand ld-hand-close" aria-hidden>see you on page one</p>
              </div>
              <div className="ld-close-cta">
                <StartButton />
                <JoinForm id="join-code-2" />
                <p className="ld-fine">Already have an account? <a href="/login" onClick={login}>Log in</a></p>
              </div>
            </section>
          </main>

        </div>
      </div>
    </div>
  );
}

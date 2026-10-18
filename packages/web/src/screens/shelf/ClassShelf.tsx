// W2: /c/:roomId, one class on my shelf. The class as an open manual: a running head with
// the class and my place in it, divider tabs on the fore edge for Notes, Flashcards,
// Questions, Materials and Checks. Each class keeps its own; nothing here is shared across.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Ellipsis, Play, RotateCw, TriangleAlert } from 'lucide-react';
import type { CardReviewRow, NoteBlockRow } from '@chalk/schema';
import { dueCards, fetchClassLibrary, type ClassLibrary } from '../../lib/library';
import { navigate } from '../../lib/router';
import { sectionHue, sectionInk } from '../../ui/section';
import { transition } from '../../ui/motion';
import { Stamp, type StampTone } from '../../ui/Stamp';
import { ShelfNotes } from './ShelfNotes';
import { Flashcards } from './Flashcards';
import { ShelfQuestions } from './ShelfQuestions';
import { Materials } from './Materials';
import { Checks } from './Checks';
import { dayWords } from './words';
import { Export } from './Export';
import { BookNext } from '../library/BookNext';
import { classKudos } from '../library/files';
import '../../ui/ui.css';
import './shelf.css';
// Last on purpose: PhoneNav pulls in entry.css, which must not jump ahead of this page's stylesheets.
import { PhoneNav } from '../../ui/PhoneNav';

const TABS = ['notes', 'cards', 'questions', 'materials', 'checks'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { notes: 'Notes', cards: 'Flashcards', questions: 'Questions', materials: 'Materials', checks: 'Checks' };
/** phones: the five tabs fit across the leaf when Flashcards reads Cards */
const SHORT: Partial<Record<Tab, string>> = { cards: 'Cards' };
const PHONE = '(max-width: 760px)';
const usePhone = () => useSyncExternalStore((l) => {
  const m = matchMedia(PHONE); m.addEventListener('change', l); return () => m.removeEventListener('change', l);
}, () => matchMedia(PHONE).matches);
const ICON = { size: 16, strokeWidth: 2 } as const;
const NOT_ON_SHELF = 'This class is not on your shelf';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; text: string } | { state: 'ready'; lib: ClassLibrary };

const tabKey = (roomId: string) => `chalk:shelf-tab:${roomId}`;
const readTab = (roomId: string): Tab => {
  try {
    const t = localStorage.getItem(tabKey(roomId));
    return (TABS as readonly string[]).includes(t ?? '') ? (t as Tab) : 'notes';
  } catch { return 'notes'; }
};

const goHome = () => navigate('/#classes');

export function ClassShelf({ roomId }: { roomId: string }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tab, setTabState] = useState<Tab>(() => readTab(roomId));

  const fetchIt = useCallback(() => {
    let live = true;
    setLoad({ state: 'loading' });
    fetchClassLibrary(roomId)
      .then((lib) => {
        if (!live) return;
        const mine = lib.members.find((m) => m.user_id === lib.me);
        if ((!mine && lib.room.host_id !== lib.me) || mine?.banned) setLoad({ state: 'missing' });
        else setLoad({ state: 'ready', lib });
      })
      .catch((e: Error) => {
        if (!live) return;
        setLoad(e.message.startsWith(NOT_ON_SHELF) ? { state: 'missing' } : { state: 'error', text: e.message || 'Could not load the class.' });
      });
    return () => { live = false; };
  }, [roomId]);
  useEffect(() => fetchIt(), [fetchIt]);

  useEffect(() => {
    document.title = load.state === 'ready' ? `${load.lib.room.title} · Chalkroom Live` : 'Chalkroom Live';
  }, [load]);

  const setTab = (t: Tab) => {
    void transition(() => setTabState(t));
    try { localStorage.setItem(tabKey(roomId), t); } catch { /* private mode: this visit only */ }
  };

  const patch = useCallback((f: (l: ClassLibrary) => ClassLibrary) => {
    setLoad((s) => (s.state === 'ready' ? { state: 'ready', lib: f(s.lib) } : s));
  }, []);
  const onReviewed = useCallback((row: CardReviewRow) => patch((l) => ({ ...l, reviews: { ...l.reviews, [row.card_id]: row } })), [patch]);
  const onNoteSaved = useCallback((row: NoteBlockRow) => patch((l) => ({ ...l, notes: l.notes.map((n) => (n.id === row.id ? row : n)) })), [patch]);

  if (load.state === 'loading') return <Skeleton />;
  if (load.state === 'missing') return <Missing />;
  if (load.state === 'error') return <Failed text={load.text} retry={fetchIt} />;
  return <Shelf lib={load.lib} tab={tab} setTab={setTab} onReviewed={onReviewed} onNoteSaved={onNoteSaved} />;
}

function stateOf(phase: ClassLibrary['room']['phase']): { word: string; tone: StampTone } {
  if (phase === 'ended') return { word: 'Ended', tone: 'muted' };
  if (phase === 'lobby') return { word: 'Waiting to start', tone: 'pending' };
  return { word: 'Live now', tone: 'ok' };
}

function Shelf({ lib, tab, setTab, onReviewed, onNoteSaved }: {
  lib: ClassLibrary; tab: Tab; setTab: (t: Tab) => void;
  onReviewed: (row: CardReviewRow) => void; onNoteSaved: (row: NoteBlockRow) => void;
}) {
  const { room, members, me } = lib;
  const st = stateOf(room.phase);
  const host = members.find((m) => m.user_id === room.host_id) ?? members.find((m) => m.role === 'host');
  const mine = members.find((m) => m.user_id === me);
  const amHost = room.host_id === me || mine?.role === 'host';
  const due = useMemo(() => dueCards(lib).length, [lib]);
  const kudos = useMemo(() => classKudos(me, lib.questions, lib.clusters), [me, lib.questions, lib.clusters]);
  const ended = room.phase === 'ended';
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const i = TABS.indexOf(tab);
  const phone = usePhone();
  // phones: a chosen section opens at the top, just under the pinned tabs, not below the class head
  const toPanel = () => requestAnimationFrame(() => document.querySelector('.shelf-panel')?.scrollIntoView({
    block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  // phones: the tab row may scroll sideways; keep the open tab in view
  useEffect(() => { tabRefs.current[tab]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [tab]);

  const onKey = (e: KeyboardEvent) => {
    const move: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let next = -1;
    if (e.key in move) next = (i + move[e.key] + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  };

  return (
    <main className="shelf">
      <PhoneNav title="Class page" back={{ label: 'Back to your classes', go: '/#classes' }} />
      <article className="shelf-manual page-fill leaf punched" style={{ ['--section' as string]: sectionHue(i) }}>
        <header className="shelf-head">
          <div className="shelf-running pn-hide">
            <button type="button" className="btn ghost small shelf-back" onClick={goHome}>
              <ArrowLeft {...ICON} aria-hidden />Back to your classes
            </button>
            <span className="shelf-brand">Chalkroom Live</span>
          </div>
          <div className="shelf-title-row">
            <div className="grow">
              <h1 className="shelf-title">{room.title}</h1>
              <dl className="shelf-facts">
                <div><dt className="sr-only">State</dt><dd><Stamp tone={st.tone}>{st.word}</Stamp></dd></div>
                <div><dt className="sr-only">Date</dt><dd>{dayWords(room.started_at ?? room.created_at)}</dd></div>
                <div><dt>Host</dt><dd>{amHost ? 'You' : host?.display_name ?? 'Unknown'}</dd></div>
                <div><dt>You are</dt><dd>{amHost ? 'the host' : 'a learner'}</dd></div>
                {kudos.peopleHelped > 0 && (
                  <div className="shelf-kudos"><dt>Kudos</dt><dd>Your questions helped <span className="mono">{kudos.peopleHelped}</span> {kudos.peopleHelped === 1 ? 'person' : 'people'}</dd></div>
                )}
              </dl>
            </div>
            {!ended && (
              <button type="button" className="btn primary btn-lg shelf-rejoin" onClick={() => navigate(`/r/${room.invite_code}`)}>
                Rejoin the class<ArrowRight {...ICON} aria-hidden />
              </button>
            )}
            {ended && (
              <a className="btn primary btn-lg shelf-rejoin" href={`/c/${room.id}/replay`}
                onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); navigate(`/c/${room.id}/replay`); }}>
                <Play {...ICON} aria-hidden />Replay this class
              </a>
            )}
          </div>
          {phone ? (
            // phones: booking and export fold into one key under the replay button
            <details className="shelf-more">
              <summary className="shelf-more-key">
                <Ellipsis {...ICON} aria-hidden />
                <span className="grow">{ended && amHost ? 'Book the next session, export' : 'Export notes and cards'}</span>
                <ChevronDown {...ICON} aria-hidden className="shelf-more-chev" />
              </summary>
              <div className="shelf-actions">
                {ended && amHost && <BookNext room={room} variant="shelf" />}
                <Export lib={lib} />
              </div>
            </details>
          ) : (
            <div className="shelf-actions">
              {ended && amHost && <BookNext room={room} variant="shelf" />}
              <Export lib={lib} />
            </div>
          )}
        </header>

        <div className="shelf-tabs" role="tablist" aria-label="Sections of this class" onKeyDown={onKey}>
          {TABS.map((t, k) => (
            <button key={t} type="button" role="tab" id={`shelf-tab-${t}`} aria-controls={`shelf-panel-${t}`}
              aria-selected={t === tab} tabIndex={t === tab ? 0 : -1}
              ref={(el) => { tabRefs.current[t] = el; }}
              className="shelf-tab" style={{ ['--hue' as string]: sectionHue(k), ['--on-hue' as string]: sectionInk(k) }}
              onClick={() => { setTab(t); if (phone) toPanel(); }}>
              {phone && SHORT[t] ? <span>{SHORT[t]}</span> : <span>{LABEL[t]}</span>}
              {t === 'cards' && due > 0 && <span className="shelf-tab-count mono" aria-label={`${due} due now`}>{due}</span>}
            </button>
          ))}
        </div>

        <section className="shelf-panel" role="tabpanel" id={`shelf-panel-${tab}`} aria-labelledby={`shelf-tab-${tab}`} key={tab}>
          {tab === 'notes' && <ShelfNotes roomId={room.id} notes={lib.notes} members={members} me={me} onSaved={onNoteSaved} />}
          {tab === 'cards' && <Flashcards cards={lib.cards} reviews={lib.reviews} onReviewed={onReviewed} />}
          {tab === 'questions' && <ShelfQuestions questions={lib.questions} clusters={lib.clusters} me={me} />}
          {tab === 'materials' && <Materials sources={lib.sources} events={lib.events} roomId={lib.room.id} room={lib.room} members={lib.members} me={lib.me} />}
          {tab === 'checks' && <Checks events={lib.events} plan={room.lesson_plan} />}
        </section>
      </article>
    </main>
  );
}

function Skeleton() {
  return (
    <main className="shelf" aria-busy="true">
      <PhoneNav title="Class page" back={{ label: 'Back to your classes', go: '/#classes' }} />
      <article className="shelf-manual page-fill leaf punched">
        <header className="shelf-head">
          <div className="shelf-running pn-hide">
            <button type="button" className="btn ghost small shelf-back" onClick={goHome}><ArrowLeft {...ICON} aria-hidden />Back to your classes</button>
            <span className="shelf-brand">Chalkroom Live</span>
          </div>
          <div className="shelf-title-row"><div className="grow">
            <span className="shelf-bone shelf-bone-title" />
            <span className="shelf-bone shelf-bone-line" />
          </div></div>
        </header>
        <div className="shelf-panel">
          <p className="sr-only" role="status">Opening the class</p>
          {[0, 1, 2].map((k) => <span key={k} className="shelf-bone shelf-bone-block" />)}
        </div>
      </article>
    </main>
  );
}

function Missing() {
  return (
    <main className="shelf">
      <PhoneNav title="Class page" back={{ label: 'Back to your classes', go: '/#classes' }} />
      <article className="shelf-manual page-fill leaf punched shelf-problem">
        <header className="shelf-head"><div className="shelf-running pn-hide"><span className="shelf-brand">Chalkroom Live</span></div></header>
        <h1 className="shelf-title">Not on your shelf</h1>
        <p className="shelf-lede">This class is not on your shelf. Join it with its invite code first.</p>
        <div className="shelf-problem-actions">
          <button type="button" className="btn primary" onClick={goHome}><ArrowLeft {...ICON} aria-hidden />Back to your classes</button>
        </div>
      </article>
    </main>
  );
}

function Failed({ text, retry }: { text: string; retry: () => void }) {
  return (
    <main className="shelf">
      <PhoneNav title="Class page" back={{ label: 'Back to your classes', go: '/#classes' }} />
      <article className="shelf-manual page-fill leaf punched shelf-problem">
        <header className="shelf-head"><div className="shelf-running pn-hide">
          <button type="button" className="btn ghost small shelf-back" onClick={goHome}><ArrowLeft {...ICON} aria-hidden />Back to your classes</button>
          <span className="shelf-brand">Chalkroom Live</span>
        </div></header>
        <h1 className="shelf-title">The class did not open</h1>
        <p className="errata" role="alert"><TriangleAlert {...ICON} aria-hidden />{text} Check your connection, then try again.</p>
        <div className="shelf-problem-actions">
          <button type="button" className="btn primary" onClick={retry}><RotateCw {...ICON} aria-hidden />Try again</button>
        </div>
      </article>
    </main>
  );
}

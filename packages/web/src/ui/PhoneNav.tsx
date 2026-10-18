// Lane N: the phone navigation (phones only, the app's 760 px breakpoint; desktop never renders
// any of this). PhoneNav is one compact running head for every page: a back arrow or the brand,
// the page name and the burger. PhoneMenu is the burger with its drawer, "the divider-tab index":
// a ruled leaf slides in from the right and the notebook's coloured divider tabs fan out of its
// fore edge, one per destination, each row read like the contents page (name, dotted leader,
// page number). It holds the Home sections, Replays, the account sections and Log out; pages add
// their own groups (the classroom adds voice, the lesson parts and Leave class; the landing page
// its sections). Closes on the X, a scrim tap, Escape, the phone's back button or a swipe right.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, LogIn, LogOut, X } from 'lucide-react';
import { signOut, useAuth } from '../lib/auth';
import { navigate } from '../lib/router';
import { usePhone } from '../features/phone';
import { forgetJoined } from '../screens/auth/shared';
import { TABS as HOME_TABS, REPLAYS } from '../screens/home/contents';
import { sectionHue, sectionInk } from './section';
import { Punch } from './Punch';
import './phone-nav.css';

export { usePhone };

export interface PhoneRow {
  key: string;
  label: string;
  /** a path to open (a hash on the same page switches that page's tab) */
  go?: string;
  /** an action instead of a path */
  run?: () => void;
  /** keep the drawer open after run (a switch such as the tutor's voice) */
  keepOpen?: boolean;
  /** the divider tab's colour; a neutral tab when left out */
  hue?: string;
  onHue?: string;
  /** the right-hand column: a page number, a word or an icon */
  page?: ReactNode;
  current?: boolean;
  /** a switch: read out as pressed or not */
  pressed?: boolean;
  /** a finished lesson part: shown faded */
  done?: boolean;
}
export interface PhoneGroup {
  title: string;
  rows: PhoneRow[];
  /** a read-only outline (the lesson parts): drawn as a list, not as divider-tab destinations,
   *  and kept out of the navigation landmark */
  outline?: boolean;
}

const ACCOUNT_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'security', label: 'Security' },
  { id: 'account', label: 'Account' },
] as const;

/** The groups every signed-in page shares: Home's contents, Replays and the account sections. */
function sharedGroups(current?: string): PhoneGroup[] {
  return [
    {
      title: 'Contents',
      rows: [
        ...HOME_TABS.map((t, i) => ({
          key: `home:${t.id}`, label: t.entry, go: `/#${t.id}`, hue: sectionHue(i), onHue: sectionInk(i),
          page: <span className="mono">{i + 1}</span>, current: current === `home:${t.id}`,
        })),
        { key: 'replays', label: 'Replays', go: REPLAYS.path, page: <ArrowRight size={16} strokeWidth={2} aria-hidden />, current: current === 'replays' },
      ],
    },
    {
      title: 'Notebook settings',
      rows: ACCOUNT_TABS.map((t, i) => ({
        key: `account:${t.id}`, label: t.label, go: `/account#${t.id}`, hue: sectionHue(i + 3), onHue: sectionInk(i + 3),
        current: current === `account:${t.id}`,
      })),
    },
  ];
}

const BACK_KEY = 'pnMenu';

/** Focus the first element matching `selector` that is not `not`, waiting up to about two
 *  seconds for it to render (a route change re-renders inside a view transition). */
function focusSoon(selector: string, not?: Element | null) {
  let frames = 0;
  const tick = () => {
    const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e !== not && e.isConnected);
    if (!el) { if (frames++ < 120) requestAnimationFrame(tick); return; }
    if (!el.matches('button, a[href], input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };
  requestAnimationFrame(tick);
}

/** Closing the drawer pops the history entry it added; tell the router that this popstate is
 *  not a page change (no focus move, no page announcement). */
function popOwnEntry() {
  (window as { __pnClosing?: boolean }).__pnClosing = true;
  history.back();
}

export function PhoneMenu({ current, groups = [], shared = true, foot = true }: {
  /** the destination this page shows, e.g. `home:start`, `account:profile`, `replays` */
  current?: string;
  /** page groups, listed above the shared ones */
  groups?: PhoneGroup[];
  /** list the shared contents and settings (signed in) */
  shared?: boolean;
  /** the Log out (or Log in) foot; a live class leaves it out, as it does the shared groups */
  foot?: boolean;
}) {
  const me = useAuth((s) => s.me);
  const [state, setState] = useState<'closed' | 'open' | 'closing'>('closed');
  const trigger = useRef<HTMLButtonElement>(null);
  const leaf = useRef<HTMLDivElement>(null);
  const pending = useRef<(() => void) | null>(null);
  const pushed = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const open = state === 'open';

  const finish = () => {
    if (closeTimer.current !== undefined) return; // already closing
    setState('closing');
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = undefined;
      setState('closed');
      const act = pending.current;
      pending.current = null;
      if (act) act(); else trigger.current?.focus({ preventScroll: true });
    }, reduced() ? 120 : 220);
  };

  /** close; then run `act` once the history entry the drawer added is gone */
  const close = (act?: () => void) => {
    if (state !== 'open') return;
    pending.current = act ?? null;
    if (pushed.current) { pushed.current = false; popOwnEntry(); } else finish();
  };

  const show = () => {
    // only from fully closed: a tap during the close animation is ignored
    if (state !== 'closed' || closeTimer.current !== undefined) return;
    // the phone's back button closes the drawer instead of leaving the page
    history.pushState({ ...(history.state ?? {}), [BACK_KEY]: true }, '');
    pushed.current = true;
    setState('open');
  };

  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    root?.setAttribute('inert', '');
    html.style.overflow = 'hidden';
    leaf.current?.querySelector<HTMLElement>('.pn-close')?.focus({ preventScroll: true });

    const onPop = () => { if (pushed.current) pushed.current = false; finish(); };
    // the phone's back button pops the drawer's own entry: not a page change for the router
    // (a capture listener on window runs before the router's)
    const onPopCapture = () => { if (pushed.current) (window as { __pnClosing?: boolean }).__pnClosing = true; };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab' || !leaf.current) return;
      const list = [...leaf.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('popstate', onPopCapture, true);
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPopCapture, true);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      root?.removeAttribute('inert');
      html.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // leaving the page with the drawer open (a route change) drops the extra history entry's role
  useEffect(() => () => {
    root()?.removeAttribute('inert');
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
  }, []);

  // a swipe to the right closes the drawer
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { if (e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current; swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = Math.abs(e.clientY - s.y);
    if (dx > 60 && dx > dy * 1.5) close();
  };

  const select = (r: PhoneRow) => {
    if (r.run && r.keepOpen) { r.run(); return; }
    close(() => {
      if (r.run) { r.run(); return; }
      if (!r.go) return;
      const url = new URL(r.go, location.href);
      const samePage = url.pathname === location.pathname;
      navigate(r.go);
      // Home and Account switch their tab on hashchange; a pushState does not fire one. The
      // router moves focus only on a new page, so here focus goes to the tab just selected.
      if (samePage && url.hash) {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        requestAnimationFrame(() => (document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? trigger.current)?.focus({ preventScroll: true }));
      } else if (samePage) trigger.current?.focus({ preventScroll: true });
    });
  };

  const name = me ? me.profile.display_name || me.profile.username : '';
  const common = shared && me ? sharedGroups(current) : [];
  const all = [...groups, ...common];
  const currentHue = all.flatMap((g) => g.rows).find((r) => r.current)?.hue;
  const outlines = groups.filter((g) => g.outline);
  let n = 0;

  const renderGroups = (list: PhoneGroup[]) => list.filter((g) => !g.outline).map((g) => (
    <section key={g.title} className="pn-group" aria-label={g.title}>
      <h2 className="pn-group-title">{g.title}</h2>
      <ul className="pn-list">
        {g.rows.map((r) => {
          const i = n++;
          const style = { ['--i' as string]: i, ['--hue' as string]: r.hue ?? 'var(--paper-3)', ['--on-hue' as string]: r.onHue ?? 'var(--ink)' };
          const inner = (
            <>
              <span className={`pn-tab${r.hue ? '' : ' is-plain'}`} aria-hidden />
              <span className="pn-label">{r.label}</span>
              <span className="pn-leader" aria-hidden />
              {r.page !== undefined && <span className="pn-page" aria-hidden>{r.page}</span>}
            </>
          );
          const cls = `pn-row${r.current ? ' is-current' : ''}${r.done ? ' is-done' : ''}`;
          return (
            <li key={r.key} style={style}>
              {r.go ? (
                <a className={cls} href={r.go} aria-current={r.current ? 'page' : undefined}
                  onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); select(r); }}>{inner}</a>
              ) : (
                <button type="button" className={cls} aria-pressed={r.pressed} aria-current={r.current ? 'true' : undefined} onClick={() => select(r)}>{inner}</button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  ));

  const drawer = state === 'closed' ? null : createPortal(
    <div className="pn-root" data-state={state}>
      <div className="pn-scrim" onClick={() => close()} aria-hidden />
      <div ref={leaf} className="pn-leaf" role="dialog" aria-modal="true" aria-label="Menu"
        onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipe.current = null; }}
        style={currentHue ? { ['--pn-hue' as string]: currentHue } : undefined}>
        <div className="pn-sheet">
          <button type="button" className="pn-close" aria-label="Close menu" onClick={() => close()}>
            <X size={20} strokeWidth={2.25} aria-hidden />
          </button>
          {me ? (
            <div className="pn-cover">
              <p className="pn-belongs">This notebook belongs to</p>
              <div className="pn-owner">
                <Punch name={name} color={me.profile.color} />
                <span className="pn-owner-text">
                  <span className="pn-owner-name display-hand">{name}</span>
                  {me.email && <span className="pn-owner-email">{me.email}</span>}
                </span>
              </div>
            </div>
          ) : (
            <p className="pn-cover pn-cover-out"><span className="pn-brand-word">Chalkroom Live</span></p>
          )}

          {/* the page's own groups first, then where the class is (read-only, outside the
              navigation landmarks), then the pages every signed-in page shares */}
          {outlines.length ? (
            <>
              {groups.some((g) => !g.outline) && <nav aria-label="This page">{renderGroups(groups)}</nav>}
              {outlines.map((g) => (
                <section key={g.title} className="pn-group pn-outline" aria-label={g.title}>
                  <h2 className="pn-group-title">{g.title}</h2>
                  <ol className="pn-list">
                    {g.rows.map((r) => (
                      <li key={r.key} className={`pn-step${r.current ? ' is-current' : ''}${r.done ? ' is-done' : ''}`}
                        style={{ ['--hue' as string]: r.hue ?? 'var(--paper-3)' }} aria-current={r.current ? 'step' : undefined}>
                        <span className="pn-step-mark" aria-hidden>{r.page}</span>
                        <span className="pn-label">{r.label}</span>
                        {r.current && <span className="pn-step-now">Now</span>}
                        {r.done && !r.current && <span className="sr-only">, done</span>}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
              {common.length > 0 && <nav aria-label="Pages">{renderGroups(common)}</nav>}
            </>
          ) : (
            <nav aria-label="Pages">{renderGroups(all)}</nav>
          )}

          {foot && <div className="pn-foot">
            {me ? (
              <button type="button" className="btn pn-foot-btn" onClick={() => close(() => {
                const before = document.querySelector('main h1');
                forgetJoined();
                // a replace skips the router's focus step: focus the signed-out page's heading
                void signOut().then(() => { navigate('/', true); focusSoon('main h1, h1', before); });
              })}>
                <LogOut size={16} strokeWidth={2} aria-hidden />Log out
              </button>
            ) : (
              <>
                <a className="btn pn-foot-btn" href="/login" onClick={(e) => { e.preventDefault(); close(() => navigate('/login')); }}>
                  <LogIn size={16} strokeWidth={2} aria-hidden />Log in
                </a>
                <a className="btn primary pn-foot-btn" href="/signup" onClick={(e) => { e.preventDefault(); close(() => navigate('/signup')); }}>
                  Create an account
                </a>
              </>
            )}
          </div>}
        </div>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <button ref={trigger} type="button" className="pn-burger" aria-haspopup="dialog" aria-expanded={open}
        aria-label={me ? `Menu, signed in as ${name}` : 'Menu'} onClick={() => (state === 'closed' ? show() : open ? close() : undefined)}>
        <span className="pn-burger-tabs" aria-hidden><i /><i /><i /></span>
      </button>
      {drawer}
    </>
  );
}

const root = () => document.getElementById('root');
/** the account's motion choice wins over the system setting, as in styles.css */
const reduced = () => {
  const pref = document.documentElement.dataset.motion;
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/** The phone running head: back arrow or brand, the page name, the burger. Phones only. */
export function PhoneNav({ title, back, current, groups, shared, action, banner = false }: {
  title?: string;
  /** a page with no other landmark around the bar (the landing page): render it as the banner */
  banner?: boolean;
  /** a compact control before the burger (the landing page's Log in) */
  action?: ReactNode;
  back?: { label: string; go: string } | { label: string; run: () => void };
  current?: string;
  groups?: PhoneGroup[];
  shared?: boolean;
}) {
  const phone = usePhone();
  if (!phone) return null;
  const Bar = banner ? 'header' : 'div';
  return (
    <Bar className="pn-bar">
      {back ? (
        <button type="button" className="pn-back" aria-label={back.label}
          onClick={() => ('go' in back ? navigate(back.go) : back.run())}>
          <ArrowLeft size={20} strokeWidth={2.25} aria-hidden />
        </button>
      ) : (
        <a className="pn-brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>Chalkroom Live</a>
      )}
      {title && <span className="pn-title">{title}</span>}
      {action}
      <PhoneMenu current={current} groups={groups} shared={shared} />
    </Bar>
  );
}

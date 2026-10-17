// AS: the account page, a leaf of the manual with four divider tabs on the fore edge (across the
// top on phones): Profile, Preferences, Security, Account. Deep links: /account#security.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft } from 'lucide-react';
import { refreshMe, useAuth } from '../../lib/auth';
import { navigate } from '../../lib/router';
import { sectionHue, sectionInk } from '../../ui/section';
import { Errata, ICON, Portrait } from './parts';
import { ProfileSection } from './ProfileSection';
import { PreferencesSection } from './PreferencesSection';
import { SecuritySection } from './SecuritySection';
import { AccountSection } from './AccountSection';
import '../../ui/ui.css';
import '../entry.css';
import './account.css';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'security', label: 'Security' },
  { id: 'account', label: 'Account' },
] as const;
type Tab = (typeof TABS)[number]['id'];
const isTab = (s: string): s is Tab => TABS.some((t) => t.id === s);
const hashTab = (): Tab => { const h = location.hash.slice(1).toLowerCase(); return isTab(h) ? h : 'profile'; };

const PHONE = '(max-width: 760px)';
const usePhone = () => useSyncExternalStore((l) => {
  const m = matchMedia(PHONE); m.addEventListener('change', l); return () => m.removeEventListener('change', l);
}, () => matchMedia(PHONE).matches);

export function Account() {
  const me = useAuth((s) => s.me);
  const authError = useAuth((s) => s.error);
  const [tab, setTab] = useState<Tab>(hashTab);
  const phone = usePhone();
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    const onHash = () => setTab(hashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const select = (t: Tab, focus = false) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
    if (focus) tabRefs.current[t]?.focus();
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(TABS[(next + TABS.length) % TABS.length].id, true);
  };
  const hue = TABS.findIndex((t) => t.id === tab);

  return (
    <div className="entry">
      <article className="manual leaf punched acct-manual">
        <div className="acct-tabs" role="tablist" aria-label="Account" aria-orientation={phone ? 'horizontal' : 'vertical'} onKeyDown={onTabKey}>
          {TABS.map((t, i) => (
            <button key={t.id} type="button" role="tab" id={`acct-tab-${t.id}`} aria-controls="acct-panel"
              aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              className="acct-tab" style={{ ['--hue' as string]: sectionHue(i), ['--on-hue' as string]: sectionInk(i) }}
              onClick={() => select(t.id)}>
              <span className="acct-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        <header className="manual-head">
          <a className="btn ghost manual-back" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
            <ArrowLeft {...ICON} aria-hidden />Back to your classes
          </a>
          <span className="manual-brand">Chalkroom Live</span>
        </header>

        <div className="manual-body acct-body">
          <aside className="acct-id" aria-label="You">
            {me ? (
              <>
                <Portrait name={me.profile.display_name} color={me.profile.color} src={me.avatarUrl} size={72} />
                <div className="acct-id-text">
                  <h1 className="acct-title">{me.profile.display_name}</h1>
                  <p className="acct-handle">@{me.profile.username}</p>
                  {me.email && <p className="acct-email">{me.email}</p>}
                </div>
              </>
            ) : (
              <div className="acct-id-text" aria-hidden>
                <span className="acct-sk acct-sk-portrait" />
                <span className="acct-sk acct-sk-title" />
                <span className="acct-sk acct-sk-meta" />
              </div>
            )}
          </aside>

          <div id="acct-panel" className="acct-panel" role="tabpanel" aria-labelledby={`acct-tab-${tab}`} tabIndex={-1}
            style={{ ['--hue' as string]: sectionHue(hue) }} key={tab}>
            {!me ? (
              authError ? (
                <Errata>Could not load your account. {authError} <button type="button" className="text-link" onClick={() => void refreshMe()}>Try again</button></Errata>
              ) : <PanelSkeleton />
            ) : tab === 'profile' ? <ProfileSection me={me} />
              : tab === 'preferences' ? <PreferencesSection />
                : tab === 'security' ? <SecuritySection me={me} />
                  : <AccountSection me={me} />}
          </div>
        </div>
      </article>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="acct-section" aria-busy="true">
      <p className="acct-note" role="status">Opening your account</p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="field" aria-hidden><span className="acct-sk acct-sk-label" /><span className="acct-sk acct-sk-input" /></div>
      ))}
    </div>
  );
}

// Lane P: the not-found page. A torn-out leaf: the address that led nowhere, then the notebook's
// contents with dotted leaders (the same entries and page numbers as Home) so the next step is
// one tap away. It renders after the login gate, so the account menu is always there.
import { useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { navigate } from '../lib/router';
import { sectionHue } from '../ui/section';
import { AccountMenu } from './auth/AccountMenu';
import { REPLAYS, TABS } from './home/contents';
import '../ui/ui.css';
import './entry.css';
import './home/home.css';
import './notfound.css';
// Last on purpose: PhoneNav pulls in entry.css, which must not jump ahead of this page's stylesheets.
import { PhoneNav } from '../ui/PhoneNav';

const ICON = { size: 16, strokeWidth: 2 } as const;

const go = (path: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(path);
};

export function NotFound() {
  const where = location.pathname + location.search;
  useEffect(() => { document.title = 'Page not found · Chalkroom Live'; }, []);

  return (
    <div className="entry nf-page">
      <PhoneNav />
      <article className="manual leaf punched page-fill nf-leaf">
        <header className="manual-head pn-hide">
          <a className="btn ghost small manual-back" href="/" onClick={go('/')}><ArrowLeft {...ICON} aria-hidden /> Chalkroom Live</a>
          <AccountMenu phoneMenu={false} />
        </header>

        <main className="manual-body nf-body">
          <section className="title-block">
            <h1 className="display nf-title">This page is not in the notebook</h1>
            <p className="lede">The link may be old, or the address has a typo. Nothing was lost: your classes and notes are where you left them.</p>
            <p className="nf-where">
              <span className="nf-where-label">You asked for</span>
              <span className="mono nf-path">{where}</span>
            </p>
            <div className="nf-actions">
              <a className="btn primary btn-lg" href="/" onClick={go('/')}>Go to the contents page <ArrowRight {...ICON} aria-hidden /></a>
            </div>
          </section>

          <nav className="toc nf-toc" aria-labelledby="nf-toc-title">
            <h2 id="nf-toc-title" className="toc-title">Contents</h2>
            <ol className="toc-list">
              {TABS.map((t, i) => (
                <li key={t.id}>
                  <a className="toc-entry" href={`/#${t.id}`} onClick={go(`/#${t.id}`)} style={{ ['--hue' as string]: sectionHue(i) }}>
                    <span className="toc-name">{t.entry}</span>
                    <span className="toc-leader" aria-hidden />
                    <span className="toc-page mono" aria-hidden>{i + 1}</span>
                  </a>
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
            <p className="form-note nf-code">Have an invite code? Links look like <span className="mono">/r/KPXCNK</span>.</p>
          </nav>
        </main>
      </article>
    </div>
  );
}

export default NotFound;

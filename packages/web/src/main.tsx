// first: this page claims the one tutor voice at once, on every route (lib/voiceFront.ts)
import './lib/voiceFront';
import { StrictMode, lazy, Suspense, useEffect, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/source-serif-4/index.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';
import { usePath } from './lib/router';
import { initAuth, useAuth } from './lib/auth';
import { PageSkeleton } from './ui/PageSkeleton';

// Every route is its own chunk; the first screen in index.html covers the wait.
const named = <K extends string, P>(load: () => Promise<Record<K, ComponentType<P>>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const Landing = lazy(() => import('./screens/landing/Landing'));
const NotFound = lazy(() => import('./screens/NotFound'));
const Home = named(() => import('./screens/Home'), 'Home');
const RoomRoute = named(() => import('./screens/RoomRoute'), 'RoomRoute');
const ClassShelf = named(() => import('./screens/shelf/ClassShelf'), 'ClassShelf');
const Login = named(() => import('./screens/auth/Login'), 'Login');
const Signup = named(() => import('./screens/auth/Signup'), 'Signup');
const MfaStep = named(() => import('./screens/auth/MfaStep'), 'MfaStep');
const Account = named(() => import('./screens/account/Account'), 'Account');
const CoursePage = named(() => import('./screens/courses/CoursePage'), 'CoursePage');
const ReplayLibrary = named(() => import('./screens/library/ReplayLibrary'), 'ReplayLibrary');
const ReplayPlayer = named(() => import('./screens/library/ReplayPlayer'), 'ReplayPlayer');

// Dev preview of every classroom state on fixture data; tree-shaken out of production builds.
const DevClassroom = import.meta.env.DEV ? lazy(() => import('./dev/DevClassroom').then((m) => { void import('./dev/dev.css'); return { default: m.DevClassroom }; })) : null;

/** A stored Supabase session: while auth loads, a returning member sees the skeleton, not the landing page. */
const hadSession = (() => {
  try { return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')); } catch { return false; }
})();

/** Pages where the tutor may speak. Anywhere else, no lesson voice keeps playing. */
const speaks = (path: string) => path.startsWith('/r/') || /^\/c\/[^/]+\/replay/.test(path) || path.startsWith('/dev/classroom');

function Routes({ path }: { path: string }) {
  const status = useAuth((s) => s.status);
  if (DevClassroom && path.startsWith('/dev/classroom')) return <DevClassroom />;

  // public pages
  if (path === '/signup') return <Signup />;
  if (path === '/login') return <Login />;
  // the landing page for visitors, before the login gate (also while auth is still loading)
  if (path === '/' && (status === 'signedOut' || (status === 'loading' && !hadSession))) return <Landing />;

  // the login gate: everything else needs an account (and a passed second factor)
  if (status === 'loading') return <PageSkeleton />;
  if (status === 'signedOut') return <Login next={path + location.hash} />;
  if (status === 'mfa') return <MfaStep />;

  if (path === '/') return <Home />;
  if (path === '/account') return <Account />;
  if (path === '/replays') return <ReplayLibrary />;
  const course = /^\/courses\/([0-9a-f-]{36})\/?$/.exec(path);
  if (course) return <CoursePage key={course[1]} courseId={course[1]} />;
  const replay = /^\/c\/([0-9a-f-]{36})\/replay\/?$/.exec(path);
  if (replay) return <ReplayPlayer key={replay[1]} roomId={replay[1]} />;
  const shelf = /^\/c\/([0-9a-f-]{36})\/?$/.exec(path);
  if (shelf) return <ClassShelf key={shelf[1]} roomId={shelf[1]} />;
  const room = /^\/r\/([A-Za-z0-9]+)\/?$/.exec(path);
  if (room) return <RoomRoute key={room[1].toUpperCase()} code={room[1].toUpperCase()} />;
  return <NotFound />;
}

function App() {
  const path = usePath();
  const status = useAuth((s) => s.status);
  useEffect(initAuth, []);
  // the signed-in learner's preferences (voice, speed, captions, motion) apply on this device
  // (loaded on demand: it pulls in the board player, which the landing page does not need)
  useEffect(() => { if (status === 'signedIn') void import('./lib/preferences').then((m) => m.loadPreferences()); }, [status]);
  // safety net: leaving the class for any other page silences the lesson voice at once
  useEffect(() => {
    if (!speaks(path) && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, [path]);
  return <Suspense fallback={<PageSkeleton />}><Routes path={path} /></Suspense>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

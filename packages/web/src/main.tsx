import { StrictMode, lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/source-serif-4/index.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';
import { usePath } from './lib/router';
import { Home } from './screens/Home';
import { RoomRoute } from './screens/RoomRoute';
import { ClassShelf } from './screens/shelf/ClassShelf';
import { initAuth, useAuth } from './lib/auth';
import { loadPreferences } from './lib/preferences';
import { Login } from './screens/auth/Login';
import { Signup } from './screens/auth/Signup';
import { ResetRequest } from './screens/auth/ResetRequest';
import { ResetNew } from './screens/auth/ResetNew';
import { MfaStep } from './screens/auth/MfaStep';
import { Account } from './screens/account/Account';
import { CoursePage } from './screens/courses/CoursePage';
import { ReplayLibrary } from './screens/library/ReplayLibrary';
import { ReplayPlayer } from './screens/library/ReplayPlayer';

// Dev preview of every classroom state on fixture data; tree-shaken out of production builds.
const DevClassroom = import.meta.env.DEV ? lazy(() => import('./dev/DevClassroom').then((m) => { void import('./dev/dev.css'); return { default: m.DevClassroom }; })) : null;

function App() {
  const path = usePath();
  const status = useAuth((s) => s.status);
  useEffect(initAuth, []);
  // the signed-in learner's preferences (voice, speed, captions, motion) apply on this device
  useEffect(() => { if (status === 'signedIn') void loadPreferences(); }, [status]);
  if (DevClassroom && path.startsWith('/dev/classroom')) return <Suspense fallback={null}><DevClassroom /></Suspense>;

  // public account pages
  if (path === '/signup') return <Signup />;
  if (path === '/reset') return <ResetRequest />;
  if (path === '/reset/new') return <ResetNew />;
  if (path === '/login') return <Login />;

  // the login gate: everything else needs an account (and a passed second factor)
  if (status === 'loading') return <div className="empty" role="status">Opening Chalkroom Live</div>;
  if (status === 'signedOut') return <Login next={path + location.hash} />;
  if (status === 'mfa') return <MfaStep />;

  if (path === '/account') return <Account />;
  if (path === '/replays') return <ReplayLibrary />;
  const course = /^\/courses\/([0-9a-f-]{36})\/?$/.exec(path);
  if (course) return <CoursePage key={course[1]} courseId={course[1]} />;
  const replay = /^\/c\/([0-9a-f-]{36})\/replay\/?$/.exec(path);
  if (replay) return <ReplayPlayer key={replay[1]} roomId={replay[1]} />;
  const shelf = /^\/c\/([0-9a-f-]{36})\/?$/.exec(path);
  if (shelf) return <ClassShelf key={shelf[1]} roomId={shelf[1]} />;
  const room = /^\/r\/([A-Za-z0-9]+)\/?$/.exec(path);
  return room ? <RoomRoute key={room[1].toUpperCase()} code={room[1].toUpperCase()} /> : <Home />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

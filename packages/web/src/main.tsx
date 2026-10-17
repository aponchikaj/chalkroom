import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/source-serif-4/index.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';
import { usePath } from './lib/router';
import { Home } from './screens/Home';
import { RoomRoute } from './screens/RoomRoute';
import { lazy, Suspense } from 'react';

// Dev preview of every classroom state on fixture data; tree-shaken out of production builds.
const DevClassroom = import.meta.env.DEV ? lazy(() => import('./dev/DevClassroom').then((m) => { void import('./dev/dev.css'); return { default: m.DevClassroom }; })) : null;

function App() {
  const path = usePath();
  if (DevClassroom && path.startsWith('/dev/classroom')) return <Suspense fallback={null}><DevClassroom /></Suspense>;
  const room = /^\/r\/([A-Za-z0-9]+)\/?$/.exec(path);
  return room ? <RoomRoute code={room[1].toUpperCase()} /> : <Home />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

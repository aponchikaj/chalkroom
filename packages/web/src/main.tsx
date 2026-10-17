import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './styles.css';
import { usePath } from './lib/router';
import { Home } from './screens/Home';
import { RoomRoute } from './screens/RoomRoute';

function App() {
  const path = usePath();
  const room = /^\/r\/([A-Za-z0-9]+)\/?$/.exec(path);
  return room ? <RoomRoute code={room[1].toUpperCase()} /> : <Home />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

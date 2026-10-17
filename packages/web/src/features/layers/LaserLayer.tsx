// A6 (Dev A): laser pointer. Hold L (outside text fields) and move over the board to point;
// positions go out through useRoomConn().sendLaser at most LIVE.laserHz times a second, in grid
// units, and `at: null` on release. Others' lasers draw as a dot with their name and drop out
// 1.5 s after their last update. Never stored.
import { useEffect, useRef, useState } from 'react';
import { LIVE, type LaserPayload } from '@chalk/schema';
import { gridToPx, pxToGrid } from '@chalk/board';
import { mainPlayer, useRoom } from '../../room/store';
import { useRoomConn } from '../../room/context';
import { clientToBoard, frameStyle, toPct, useBoardFrame } from './boardFrame';
import { useMainView } from './ReactionsLayer';
import './layers.css';
import { isTextEntry } from '../../lib/dom';

const STALE_MS = 1500;
const GAP_MS = 1000 / LIVE.laserHz;

interface Dot { at: [number, number]; color: string; t: number }

export function LaserLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useBoardFrame(ref);
  const { camera } = useMainView();
  const conn = useRoomConn();
  const me = useRoom((s) => s.me);
  const members = useRoom((s) => s.members);
  const myColor = (me && members[me]?.color) || 'var(--ink)';
  const [dots, setDots] = useState<Record<string, Dot>>({});
  const [holding, setHolding] = useState(false);

  // others' lasers in, and the 1.5 s cut-off
  useEffect(() => {
    if (!conn) return;
    const off = conn.onLaser((p: LaserPayload) => {
      if (p.userId === me) return;
      setDots((d) => {
        const next = { ...d };
        if (p.at) next[p.userId] = { at: p.at, color: p.color, t: Date.now() }; else delete next[p.userId];
        return next;
      });
    });
    const sweep = setInterval(() => setDots((d) => {
      const now = Date.now();
      const keep = Object.entries(d).filter(([, v]) => now - v.t < STALE_MS);
      return keep.length === Object.keys(d).length ? d : Object.fromEntries(keep);
    }), 250);
    return () => { off(); clearInterval(sweep); };
  }, [conn, me]);

  // my laser out: hold L, move, release
  const mine = useRef<{ at: [number, number] | null; last: number; timer: number | null }>({ at: null, last: 0, timer: null });
  const [myAt, setMyAt] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!conn || !me) return;
    const st = mine.current;
    let down = false;
    const send = (at: [number, number] | null) => {
      st.last = Date.now();
      conn.sendLaser({ userId: me, color: myColor, at });
    };
    const release = () => {
      if (!down) return;
      down = false;
      if (st.timer) { clearTimeout(st.timer); st.timer = null; }
      st.at = null;
      setHolding(false); setMyAt(null);
      document.body.removeAttribute('data-laser');
      send(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'l' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTextEntry(document.activeElement)) return;
      down = true;
      setHolding(true);
      document.body.setAttribute('data-laser', 'on');
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'l') release(); };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const s = mainPlayer.state;
      const cam = (mainPlayer.viewPage ?? s.current) === s.current ? s.camera : { x: 0, y: 0, zoom: 1 };
      const p = clientToBoard(cam, e.clientX, e.clientY);
      if (!p) return;
      const at = pxToGrid(p.x, p.y) as [number, number];
      st.at = at;
      setMyAt(at);
      const wait = GAP_MS - (Date.now() - st.last);
      if (wait <= 0) send(at);
      else if (!st.timer) st.timer = window.setTimeout(() => { st.timer = null; if (down && st.at) send(st.at); }, wait);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('blur', release);
    return () => {
      release();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('blur', release);
    };
  }, [conn, me, myColor]);

  const place = (at: [number, number]) => {
    const px = gridToPx(at);
    const p = toPct(camera, px.x, px.y);
    return { left: `${p.x}%`, top: `${p.y}%` };
  };

  return (
    <div ref={ref} className="layer-frame laser-frame" style={frameStyle(frame)} aria-hidden>
      {Object.entries(dots).map(([id, d]) => (
        <span key={id} className="laser" style={{ ...place(d.at), ['--who' as string]: d.color }}>
          <span className="laser-dot" />
          <span className="laser-name">{members[id]?.display_name ?? 'Someone'}</span>
        </span>
      ))}
      {myAt && (
        <span className="laser mine" style={{ ...place(myAt), ['--who' as string]: myColor }}>
          <span className="laser-dot" />
        </span>
      )}
      <span className={`laser-hint ${holding ? 'on' : ''}`}>
        {holding ? 'Pointing for the class' : <>Hold <kbd className="kbd">L</kbd> to point</>}
      </span>
    </div>
  );
}

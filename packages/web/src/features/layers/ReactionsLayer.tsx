// A6 (Dev A): confusion heat. Counts of "confused" and "got it" sit on the shapes they target,
// in board coordinates; the mark gets stronger as more of the class is confused. Selecting
// shapes brings up the react bar (the only part of this layer that takes the pointer).
import { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CircleHelp, Check } from 'lucide-react';
import type { ReactionKind, ReactionRow } from '@chalk/schema';
import type { BoardPage, Camera } from '@chalk/board';
import { mainPlayer, selectActiveMembers, useRoom } from '../../room/store';
import { useBoardViewCamera, usePlayer } from '../../board/Board';
import { api } from '../../lib/api';
import { usePhone } from '../../ui/PhoneNav';
import { frameStyle, toPct, useBoardFrame } from './boardFrame';
import './layers.css';

const ICON = { size: 14, strokeWidth: 2.25 } as const;

const NO_CAM: Camera = { x: 0, y: 0, zoom: 1 };

export function useMainView(): { page: BoardPage | undefined; camera: Camera } {
  usePlayer(mainPlayer);
  const st = mainPlayer.state;
  const idx = mainPlayer.viewPage ?? st.current;
  const page = st.pages[idx] ?? st.pages[st.current];
  // the camera the board is really drawn with (on phones the pen-following camera sits on top
  // of the tutor's), so marks and dots stay on their shapes
  const camera = useBoardViewCamera('chalk-board', idx === st.current ? st.camera : NO_CAM);
  return { page, camera };
}

export function ReactionsLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useBoardFrame(ref);
  const { page, camera } = useMainView();
  const phase = useRoom((s) => s.room?.phase);
  const reactions = useRoom((s) => s.reactions);
  const selection = useRoom(useShallow((s) => s.selection));
  const classSize = useRoom((s) => selectActiveMembers(s).length);
  const live = phase === 'teaching' || phase === 'check' || phase === 'qa';
  const phone = usePhone();

  const byShape = new Map<string, ReactionRow[]>();
  for (const r of reactions) byShape.set(r.shape_id, [...(byShape.get(r.shape_id) ?? []), r]);

  return (
    <div ref={ref} className="layer-frame" style={frameStyle(frame)} aria-hidden={!live}>
      {live && page && [...byShape].map(([id, rows]) => {
        const s = page.shapes[id];
        if (!s) return null;
        const confused = rows.filter((r) => r.kind === 'confused').length;
        const got = rows.length - confused;
        const level = confused === 0 ? 0 : confused >= 3 || confused / Math.max(classSize, 1) >= 0.4 ? 2 : 1;
        const a = toPct(camera, s.x, s.y);
        const b = toPct(camera, s.x + s.w, s.y + s.h);
        // phones: the follow camera crops the page, so a mark on a figure out of view would float
        // over the page outside the board; leave it out until the figure is in view
        if (phone && (b.x <= 0 || a.x >= 100 || b.y <= 0 || a.y >= 100)) return null;
        return (
          <div key={id} className={`heat heat-${level}`} style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${b.x - a.x}%`, height: `${b.y - a.y}%` }}>
            <span className={`heat-tag ${b.x > 82 ? 'flip' : ''}`}>
              {confused > 0 && <span className="heat-confused"><CircleHelp {...ICON} aria-hidden /><b className="mono">{confused}</b> confused</span>}
              {got > 0 && <span className="heat-got"><Check {...ICON} aria-hidden /><b className="mono">{got}</b> got it</span>}
            </span>
          </div>
        );
      })}
      {live && page && selection.length > 0 && <ReactBar page={page} camera={camera} ids={selection} />}
    </div>
  );
}

function ReactBar({ page, camera, ids }: { page: BoardPage; camera: Camera; ids: string[] }) {
  const roomId = useRoom((s) => s.room!.id);
  const mine = useRoom(useShallow((s) => s.reactions.filter((r) => r.user_id === s.me)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const shapes = ids.map((id) => page.shapes[id]).filter((s) => s && s.kind !== 'arrow');
  if (!shapes.length) return null;
  const x0 = Math.min(...shapes.map((s) => s.x)), y0 = Math.min(...shapes.map((s) => s.y));
  const x1 = Math.max(...shapes.map((s) => s.x + s.w)), y1 = Math.max(...shapes.map((s) => s.y + s.h));
  const tl = toPct(camera, x0, y0), br = toPct(camera, x1, y1);
  const below = tl.y < 14;
  const pos = { left: `${Math.min(Math.max((tl.x + br.x) / 2, 14), 86)}%`, top: `${below ? Math.min(br.y, 92) : tl.y}%` };

  const has = (id: string, kind: ReactionKind) => mine.some((r) => r.shape_id === id && r.kind === kind);
  const all = (kind: ReactionKind) => shapes.every((s) => has(s.id, kind));
  const react = async (kind: ReactionKind) => {
    // the API toggles: when every selected shape has this mark, take it off; otherwise add it where missing
    const targets = all(kind) ? shapes : shapes.filter((s) => !has(s.id, kind));
    setBusy(true); setError('');
    try {
      await Promise.all(targets.map((s) => api.react(roomId, { shapeId: s.id, kind })));
    } catch {
      setError('Not sent. Check your connection and press it again.');
    } finally {
      setBusy(false);
    }
  };
  const label = shapes.length === 1 ? 'this' : `these ${shapes.length}`;

  return (
    <div className={`reactbar step-in ${below ? 'below' : ''}`} style={pos} role="group" aria-label={`React to ${label}`}>
      <button className="btn small" aria-pressed={all('confused')} disabled={busy} onClick={() => react('confused')}>
        <CircleHelp {...ICON} aria-hidden /> Confused
      </button>
      <button className="btn small" aria-pressed={all('got_it')} disabled={busy} onClick={() => react('got_it')}>
        <Check {...ICON} aria-hidden /> Got it
      </button>
      {error && <span className="reactbar-error" role="alert">{error}</span>}
    </div>
  );
}

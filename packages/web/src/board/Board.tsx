// The whiteboard: a ruled notebook leaf the tutor writes on. Renders the player's board state,
// effects, selection and pen input; on phones the camera follows the pen (penCamera.ts).
import { useCallback, useId, useRef, useState, useSyncExternalStore, useMemo, type CSSProperties } from 'react';
import { Maximize2, PenLine } from 'lucide-react';
import { BOARD_W, BOARD_H, pxToGrid, type BoardPage, type Camera } from '@chalk/board';
import { ShapeView, Paths, RULE } from './Shapes';
import { ellipse, line } from './rough';
import { usePenCamera } from './penCamera';
import type { Player, ActiveEffect } from '../lib/player';
import './board.css';

export { useBoardViewCamera } from './penCamera';

export type Tool = 'select' | 'pen' | 'erase';

interface Props {
  player: Player;
  id?: string;
  tool?: Tool;
  selection?: string[];
  onSelect?: (ids: string[]) => void;
  onDraw?: (points: [number, number][]) => void;
  onErase?: (id: string) => void;
  emptyHint?: string;
  /**
   * On phones, follow the pen at a readable size (thumbnails never follow). Default on, except
   * for the classroom board (its overlays must map points with useBoardViewCamera first, so the
   * classroom opts in with follow) and the landing replay (a marketing figure, no controls).
   */
  follow?: boolean;
}

export function usePlayer(player: Player) {
  useSyncExternalStore(player.subscribe, player.getVersion);
  return player;
}

function bbox(page: BoardPage, ids: string[]) {
  const rs = ids.map((id) => page.shapes[id]).filter((s) => s && s.kind !== 'arrow');
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}

/** A highlighter stroke: a band in the segment hue low across the figure, swept on left to right. */
function Marker({ b }: { b: { x: number; y: number; w: number; h: number } }) {
  const band = Math.min(34, Math.max(18, b.h * 0.5));
  const x0 = b.x - 10, x1 = b.x + b.w + 10;
  const y1 = b.y + b.h + 4, y0 = y1 - band;
  // slightly uneven ends and a tilt of a pixel or two, like a real marker pass
  const d = `M${x0 + 3} ${y0 + 2} L${x1} ${y0} Q${x1 + 4} ${(y0 + y1) / 2} ${x1 - 1} ${y1 - 1} L${x0} ${y1 + 1} Q${x0 - 3} ${(y0 + y1) / 2} ${x0 + 3} ${y0 + 2} Z`;
  return <path className="fx-marker" d={d} />;
}

function EffectView({ fx, page }: { fx: ActiveEffect; page: BoardPage }) {
  const b = bbox(page, fx.ids);
  if (!b || fx.kind === 'pulse') return null;
  const key = `fx${fx.key}`;
  if (fx.kind === 'highlight') return <Marker b={b} />;
  if (fx.kind === 'underline') return <g className="fx draw" style={{ ['--dur' as string]: '450ms' }}><Paths paths={line(key, b.x - 4, b.y + b.h + 9, b.x + b.w + 4, b.y + b.h + 7, { strokeWidth: 3 })} color="var(--fig-accent)" width={3} /></g>;
  return <g className="fx draw" style={{ ['--dur' as string]: '600ms' }}><Paths paths={ellipse(key, b.x + b.w / 2, b.y + b.h / 2, b.w * 1.18 + 34, b.h * 1.3 + 30, { strokeWidth: 3 })} color="var(--fig-accent)" width={3} /></g>;
}

/** The leaf's top band (no rules), the margin rule and the binding holes, in board px. */
const HEAD = 2 * RULE;
const MARGIN_X = 66;
const HOLES = [120, 320, 520];
const HOLE_X = 30, HOLE_R = 12;
/** the rules start right of the hole column, so the holes read as punched through the paper */
const RULES_X0 = HOLE_X + HOLE_R + 10;
/**
 * The rules, in page space, so they stay under the writing at any camera. They reach well past
 * the page on every side, so a Board Script camera that zooms out (zoom < 1) or focuses near an
 * edge still shows ruled leaf. A path rather than a <pattern>: the hairline needs
 * vector-effect non-scaling-stroke, which pattern content does not honour reliably.
 */
const RULES_D = (() => {
  let d = '';
  for (let y = HEAD; y <= BOARD_H * 3; y += RULE) d += `M${-BOARD_W} ${y - 0.5}H${BOARD_W * 2}`;
  return d;
})();

/** A default page title ("Page 2") says nothing the p. N marker does not; only real titles show. */
const DEFAULT_TITLE = /^Page \d+$/;

/** The leaf's fixed parts: margin, binding holes and header, at viewBox positions (no zoom). */
function LeafChrome({ page, pageNo }: { page: BoardPage; pageNo?: number }) {
  const title = page.title && !DEFAULT_TITLE.test(page.title.trim()) && page.order.length > 0 ? page.title : '';
  return (
    <g className="leaf" aria-hidden="true">
      <path className="leaf-margin" d={`M${MARGIN_X} 0V${BOARD_H}`} />
      {HOLES.map((y) => (
        <g key={y} className="leaf-hole">
          <circle cx={HOLE_X} cy={y} r={HOLE_R} />
          {/* the inner shadow: the cut edge of the paper throws a crescent onto the desk below */}
          <path className="leaf-hole-shade" d={`M${HOLE_X - HOLE_R} ${y}a${HOLE_R} ${HOLE_R} 0 0 1 ${2 * HOLE_R} 0a${HOLE_R} ${HOLE_R - 4} 0 0 0 ${-2 * HOLE_R} 0z`} />
        </g>
      ))}
      {pageNo != null && <text className="leaf-pageno" x={MARGIN_X + 20} y={HEAD - 26}>p. {pageNo}</text>}
      {title && <text className="leaf-title" x={BOARD_W - 40} y={HEAD - 26} textAnchor="end">{title}</text>}
    </g>
  );
}

export function PageView({ page, camera, animate, effects, selection, onShapeDown, onShapeKey, onShapeFocus, tabStop, tags = true, leaf = true, pageNo }: {
  page: BoardPage; camera: Camera; animate?: Map<string, number>; effects?: ActiveEffect[]; selection?: string[];
  onShapeDown?: (e: React.PointerEvent, id: string) => void;
  /** keyboard selection: when set, figures are focusable with one roving tab stop (tabStop) */
  onShapeKey?: (e: React.KeyboardEvent, id: string) => void;
  onShapeFocus?: (id: string) => void;
  tabStop?: string;
  /** citation tags on shapes with a `source` (off in page thumbnails) */
  tags?: boolean;
  /** the ruled leaf under the figures (off in page thumbnails, where rules turn to grey) */
  leaf?: boolean;
  pageNo?: number;
}) {
  const pulsing = new Set(effects?.filter((f) => f.kind === 'pulse').flatMap((f) => f.ids));
  const sel = new Set(selection);
  // frames first so they sit under everything; arrows last so heads stay visible
  const order = [...page.order].sort((a, b) => rank(page, a) - rank(page, b));
  const cam: CSSProperties = { transform: `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`, transformOrigin: '0 0' };
  const clipId = `leaf-clip${useId().replace(/:/g, '')}`;
  return (
    <>
    {leaf && (
      <g clipPath={`url(#${clipId})`} aria-hidden="true">
        <clipPath id={clipId}><rect x={RULES_X0} y={0} width={BOARD_W - RULES_X0} height={BOARD_H} /></clipPath>
        <g className="camera" style={cam}><path className="leaf leaf-rules" d={RULES_D} /></g>
      </g>
    )}
    {leaf && <LeafChrome page={page} pageNo={pageNo} />}
    <g className="camera" style={cam}>
      {order.map((id) => {
        const s = page.shapes[id];
        if (!s) return null;
        return <ShapeView key={id} s={s} page={page} animMs={animate?.get(id)} selected={sel.has(id)} pulsing={pulsing.has(id)} onPointerDown={onShapeDown}
          onKeyDown={onShapeKey} onFocus={onShapeFocus} tabStop={onShapeKey ? tabStop === id : undefined} tags={tags} />;
      })}
      {/* the marker goes over the figure (multiply), so a card's leaf fill cannot hide it */}
      {effects?.filter((f) => f.kind === 'highlight').map((fx) => <EffectView key={fx.key} fx={fx} page={page} />)}
      {effects?.filter((f) => f.kind === 'underline' || f.kind === 'circle').map((fx) => <EffectView key={fx.key} fx={fx} page={page} />)}
    </g>
    </>
  );
}

const rank = (page: BoardPage, id: string) => {
  const k = page.shapes[id]?.kind;
  return k === 'frame' ? 0 : k === 'arrow' ? 2 : 1;
};

export function Board({ player, id = 'chalk-board', tool = 'select', selection = [], onSelect, onDraw, onErase, emptyHint, follow = !NO_FOLLOW.has(id) }: Props) {
  usePlayer(player);
  const svgRef = useRef<SVGSVGElement>(null);
  const [stroke, setStroke] = useState<[number, number][] | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; clear?: boolean } | null>(null);

  const st = player.state;
  const pageIndex = player.viewPage ?? st.current;
  const page = st.pages[pageIndex] ?? st.pages[st.current];
  const live = pageIndex === st.current;
  const boardCam = live ? st.camera : NO_CAMERA;
  const pen = usePenCamera({ svg: svgRef, id, enabled: follow, page, cam: boardCam, animate: live ? player.animate : undefined });
  const camera = pen.view;

  const toBoard = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x / camera.zoom + camera.x, y: p.y / camera.zoom + camera.y };
  };

  // Shapes are memoised and compare this handler by identity, so it must stay stable and read
  // the live tool, page and selection from a ref (a stale closure broke shift-click multi-select).
  const latest = useRef({ tool, page, selection, onSelect, onErase });
  latest.current = { tool, page, selection, onSelect, onErase };
  const onShapeDown = useCallback((e: React.PointerEvent, sid: string) => {
    const { tool, page, selection, onSelect, onErase } = latest.current;
    if (tool === 'erase') {
      if (page.shapes[sid]?.user) { e.stopPropagation(); onErase?.(sid); }
      return;
    }
    if (tool !== 'select') return;
    e.stopPropagation();
    const next = e.shiftKey || e.ctrlKey || e.metaKey
      ? (selection.includes(sid) ? selection.filter((x) => x !== sid) : [...selection, sid])
      : (selection.length === 1 && selection[0] === sid ? [] : [sid]);
    onSelect?.(next);
  }, []);

  // Keyboard: one tab stop on the figures (roving tabindex). Arrows move between them in page
  // order, Enter or Space selects (Shift adds or removes), Escape clears; with the eraser, Enter
  // or Delete rubs out one of the learner's own strokes.
  const [active, setActive] = useState<string | null>(null);
  const keyable = (tool === 'select' && !!onSelect) || (tool === 'erase' && !!onErase);
  const keyOrder = useMemo(() => page.order.filter((sid) => page.shapes[sid] && page.shapes[sid].kind !== 'group' && page.shapes[sid].kind !== 'arrow'), [page]);
  const tabStop = active && keyOrder.includes(active) ? active : (keyOrder.find((sid) => selection.includes(sid)) ?? keyOrder[0]);
  const keyOrderRef = useRef(keyOrder);
  keyOrderRef.current = keyOrder;
  const onShapeKey = useCallback((e: React.KeyboardEvent, sid: string) => {
    const { tool, page, selection, onSelect, onErase } = latest.current;
    const order = keyOrderRef.current;
    const move = (i: number) => {
      const next = order[(i + order.length) % order.length];
      if (!next) return;
      setActive(next);
      svgRef.current?.querySelector<SVGGElement>(`[data-id="${CSS.escape(next)}"]`)?.focus();
    };
    const at = order.indexOf(sid);
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); move(at + 1); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); move(at - 1); }
    else if (k === 'Home') { e.preventDefault(); move(0); }
    else if (k === 'End') { e.preventDefault(); move(order.length - 1); }
    else if (tool === 'erase') {
      if ((k === 'Enter' || k === 'Delete' || k === 'Backspace') && page.shapes[sid]?.user) { e.preventDefault(); onErase?.(sid); }
    } else if (tool === 'select') {
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        onSelect?.(e.shiftKey || e.ctrlKey || e.metaKey
          ? (selection.includes(sid) ? selection.filter((x) => x !== sid) : [...selection, sid])
          : (selection.length === 1 && selection[0] === sid ? [] : [sid]));
      } else if (k === 'Escape' && selection.length) { e.preventDefault(); onSelect?.([]); }
    }
  }, []);

  const onDown = (e: React.PointerEvent) => {
    // a second finger turns the first one's stroke or marquee into a pinch
    if (pen.gestures.down(e, tool === 'select')) { setStroke(null); setMarquee(null); return; }
    const p = toBoard(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === 'pen') setStroke([[p.x, p.y]]);
    else if (tool === 'select') {
      // a touch may be the first finger of a pinch: clear the selection on release (a tap), not here
      const touch = e.pointerType === 'touch';
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, clear: touch && !e.shiftKey });
      if (!touch && !e.shiftKey) onSelect?.([]);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (pen.gestures.move(e)) return;
    if (!stroke && !marquee) return;
    const p = toBoard(e);
    if (stroke) {
      const last = stroke[stroke.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) > 4) setStroke([...stroke, [p.x, p.y]]);
    } else if (marquee) setMarquee({ ...marquee, x1: p.x, y1: p.y });
  };
  const onUp = (e: React.PointerEvent) => {
    if (pen.gestures.up(e)) return;
    if (stroke) {
      if (stroke.length > 2) onDraw?.(simplify(stroke).map(([x, y]) => pxToGrid(x, y)));
      setStroke(null);
    }
    if (marquee) {
      const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
      const w = Math.abs(marquee.x1 - marquee.x0), h = Math.abs(marquee.y1 - marquee.y0);
      if (w > 8 && h > 8) {
        const hit = page.order.filter((sid) => {
          const s = page.shapes[sid];
          return s && s.kind !== 'arrow' && s.x < x + w && s.x + s.w > x && s.y < y + h && s.y + s.h > y;
        });
        onSelect?.([...new Set([...(marquee.clear ? [] : selection), ...hit])]);
      } else if (marquee.clear && e.type === 'pointerup') onSelect?.([]);
      setMarquee(null);
    }
  };

  // live strokes and the marquee are in page space: draw them through the same camera
  const strokePath = useMemo(() => stroke && stroke.length > 1 ? 'M' + stroke.map((p) => p.join(',')).join(' L') : '', [stroke]);
  const overlay: CSSProperties = { transform: `scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`, transformOrigin: '0 0' };

  return (
    <>
      <svg
        ref={svgRef}
        id={id}
        className={`board-svg leafed ${tool}${pen.gesturing ? ' pinching' : ''}${pen.phone ? ' cam-' + pen.mode : ''}`}
        viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="group"
        aria-roledescription="whiteboard"
        aria-label={`Whiteboard${page.title ? `: ${page.title}` : ''}. ${page.order.length} shapes.${!keyable || !page.order.length ? ''
          : tool === 'erase' ? ' Arrow keys move between figures; Enter rubs out your own drawing.'
          : ' Arrow keys move between figures; Enter selects one, Shift+Enter adds it, Escape clears.'}`}
      >
        <PageView page={page} camera={camera} animate={live ? player.animate : undefined} effects={live ? player.effects : undefined}
          selection={selection} onShapeDown={onShapeDown} pageNo={st.pages.length > 1 ? pageIndex + 1 : undefined}
          onShapeKey={keyable ? onShapeKey : undefined} onShapeFocus={keyable ? setActive : undefined} tabStop={tabStop} />
        <g style={overlay}>
          {strokePath && <path d={strokePath} className="stroke live-stroke" />}
          {marquee && <rect className="marquee" x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)} />}
        </g>
        {!page.order.length && emptyHint && <text className="board-empty" x={BOARD_W / 2} y={BOARD_H / 2} textAnchor="middle" dominantBaseline="central">{emptyHint}</text>}
      </svg>
      {pen.phone && (
        <div className="board-cam" data-board={id}>
          {pen.mode === 'follow'
            ? <button type="button" className="board-cam-btn" onClick={() => pen.show('page')} aria-label="Show the whole page" title="Whole page">
                <Maximize2 size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            : <button type="button" className="board-cam-btn" onClick={() => pen.show('follow')} aria-label="Follow the pen" title="Follow the pen">
                <PenLine size={16} strokeWidth={2} aria-hidden="true" />
              </button>}
        </div>
      )}
    </>
  );
}

const NO_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };
/** boards that do not follow the pen unless asked to (see Props.follow) */
const NO_FOLLOW = new Set(['chalk-board', 'landing-board']);

export function PageStrip({ player }: { player: Player }) {
  usePlayer(player);
  const st = player.state;
  if (st.pages.length < 2) return null;
  const viewing = player.viewPage ?? st.current;
  return (
    <div className="pagestrip" role="tablist" aria-label="Board pages">
      {st.pages.map((p, i) => (
        <button key={p.id} className="thumb" role="tab" aria-current={i === viewing} aria-label={`Page ${i + 1}: ${p.title}`}
          onClick={() => player.setViewPage(i === st.current ? null : i)}>
          <svg className="board-mini" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} width="108" height="52" aria-hidden>
            <PageView page={p} camera={NO_CAMERA} tags={false} leaf={false} />
          </svg>
          <span>{i + 1}. {p.title}</span>
        </button>
      ))}
    </div>
  );
}

/** Drop near-collinear points so stored strokes stay small. */
function simplify(pts: [number, number][], tol = 2.5): [number, number][] {
  if (pts.length < 3) return pts;
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = out[out.length - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
    const d = Math.abs((cx - ax) * (ay - by) - (ax - bx) * (cy - ay)) / (Math.hypot(cx - ax, cy - ay) || 1);
    if (d > tol) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

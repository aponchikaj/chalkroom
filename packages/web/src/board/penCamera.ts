// The phone camera. On a narrow screen the whole leaf would shrink to about a quarter of its size,
// so the board follows the pen instead: it frames the figure being drawn at a readable scale.
// "Whole page" shows everything; a pinch zooms and a one-finger drag pans by hand until "Follow
// the pen" hands control back. The region composes with the Board Script camera, and the result
// is published per board id so overlays (laser, reactions) can map board points the same way.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BOARD_H, BOARD_W, type BoardPage, type Camera } from '@chalk/board';

export type CamMode = 'follow' | 'page' | 'free';

/** A view region in post-camera board space: top-left corner and zoom factor. */
export interface Region { x: number; y: number; k: number }

const WHOLE: Region = { x: 0, y: 0, k: 1 };
const PHONE_QUERY = '(max-width: 760px)';
/** board width shown per screen px on a phone: 1320 * 0.58 / 358 gives a zoom of about 2.1 */
const READABLE = 0.58;
const MAX_K = 3;
/** below this width a board is a thumbnail (the class pip): it never follows */
const MIN_FOLLOW_W = 240;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampRegion(r: Region): Region {
  const k = clamp(r.k, 1, MAX_K);
  return { k, x: clamp(r.x, 0, BOARD_W - BOARD_W / k), y: clamp(r.y, 0, BOARD_H - BOARD_H / k) };
}

/** Compose the Board Script camera with a view region into one camera for PageView. */
export function composeCamera(cam: Camera, r: Region): Camera {
  if (r.k === 1 && r.x === 0 && r.y === 0) return cam;
  return { x: cam.x + r.x / cam.zoom, y: cam.y + r.y / cam.zoom, zoom: cam.zoom * r.k };
}

// ---- published view cameras, per board id ----
const views = new Map<string, Camera>();
const listeners = new Set<() => void>();
function publish(id: string, cam: Camera | null) {
  const prev = views.get(id);
  if (cam ? prev && prev.x === cam.x && prev.y === cam.y && prev.zoom === cam.zoom : !prev) return;
  if (cam) views.set(id, cam); else views.delete(id);
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/**
 * The camera a board is really drawn with (the Board Script camera composed with the phone
 * camera), for overlays laid over that board. Falls back to the given camera.
 */
export function useBoardViewCamera(id: string, fallback: Camera): Camera {
  const cam = useSyncExternalStore(subscribe, () => views.get(id) ?? null);
  return cam ?? fallback;
}

function usePhone(svg: React.RefObject<SVGSVGElement | null>) {
  const [wide, setWide] = useState(0);
  const [narrowScreen, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(PHONE_QUERY);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWide(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    setWide(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [svg]);
  return { phone: narrowScreen && wide >= MIN_FOLLOW_W, width: wide };
}

/** The shape the pen is on: the one being drawn, else the last one the tutor put down. */
function penTarget(page: BoardPage, animate?: Map<string, number>) {
  let id: string | undefined;
  if (animate?.size) for (const k of animate.keys()) if (page.shapes[k]) id = k;
  if (!id) {
    for (let i = page.order.length - 1; i >= 0; i--) {
      const s = page.shapes[page.order[i]];
      if (s && !s.user && s.kind !== 'arrow' && s.kind !== 'frame' && s.kind !== 'group') { id = s.id; break; }
    }
  }
  return id ? page.shapes[id] : undefined;
}

/** Frame the target, moving only when it leaves the current view (no jitter while writing). */
function followRegion(prev: Region | null, t: { x: number; y: number; w: number; h: number }, k: number): Region {
  const w = BOARD_W / k, h = BOARD_H / k, m = 16;
  if (prev && prev.k === k && t.x >= prev.x + m && t.y >= prev.y + m && t.x + t.w <= prev.x + w - m && t.y + t.h <= prev.y + h - m) return prev;
  const x = t.w + 48 > w ? t.x - 24 : t.x + t.w / 2 - w / 2;
  const y = t.h + 32 > h ? t.y - 16 : t.y + t.h / 2 - h / 2;
  return clampRegion({ x, y, k });
}

export function usePenCamera(opts: {
  svg: React.RefObject<SVGSVGElement | null>; id: string; enabled: boolean;
  page: BoardPage; cam: Camera; animate?: Map<string, number>;
}) {
  const { svg, id, enabled, page, cam, animate } = opts;
  const { phone: isPhone, width } = usePhone(svg);
  const phone = enabled && isPhone;
  const [mode, setMode] = useState<CamMode>('follow');
  const [free, setFree] = useState<Region>(WHOLE);
  const last = useRef<Region | null>(null);

  const followK = width ? clamp((BOARD_W * READABLE) / width, 1, MAX_K) : 1;
  const target = phone && mode === 'follow' ? penTarget(page, animate) : undefined;
  const tx = target ? (target.x - cam.x) * cam.zoom : 0, ty = target ? (target.y - cam.y) * cam.zoom : 0;
  const tw = target ? target.w * cam.zoom : 0, th = target ? target.h * cam.zoom : 0;

  const region = useMemo<Region>(() => {
    if (!phone || mode === 'page') return WHOLE;
    if (mode === 'free') return free;
    if (!target) return last.current && last.current.k === followK ? last.current : clampRegion({ x: 0, y: 0, k: followK });
    return followRegion(last.current, { x: tx, y: ty, w: tw, h: th }, followK);
  }, [phone, mode, free, target?.id, tx, ty, tw, th, followK]);
  useEffect(() => { if (mode === 'follow') last.current = region; }, [region, mode]);

  const view = useMemo(() => composeCamera(cam, region), [cam, region]);
  useEffect(() => { publish(id, phone ? view : null); }, [id, phone, view]);
  useEffect(() => () => publish(id, null), [id]);

  // ---- gestures: pinch to zoom, one finger to pan once zoomed by hand ----
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<null | { kind: 'pinch'; d0: number; p0: { x: number; y: number }; k0: number } | { kind: 'pan'; c0: { x: number; y: number }; r0: Region }>(null);
  /** a pinch or a pan is under way: the camera tracks the fingers with no ease */
  const [gesturing, setGesturing] = useState(false);

  /** client point to viewBox units (the region's screen space) */
  const toView = useCallback((x: number, y: number) => {
    const el = svg.current, m = el?.getScreenCTM();
    if (!el || !m) return { x: 0, y: 0 };
    const pt = el.createSVGPoint(); pt.x = x; pt.y = y;
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, [svg]);

  const current = useRef(region);
  current.current = region;

  /** returns true when the event belongs to a gesture and the board should ignore it */
  const down = useCallback((e: React.PointerEvent, canPan: boolean) => {
    if (!phone || e.pointerType !== 'touch') return false;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      const mid = toView((a.x + b.x) / 2, (a.y + b.y) / 2);
      const r = current.current;
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, p0: { x: r.x + mid.x / r.k, y: r.y + mid.y / r.k }, k0: r.k };
      setGesturing(true);
      return true;
    }
    if (canPan && mode === 'free' && current.current.k > 1) {
      gesture.current = { kind: 'pan', c0: { x: e.clientX, y: e.clientY }, r0: current.current };
      setGesturing(true);
      return true;
    }
    return false;
  }, [phone, mode, toView]);

  const move = useCallback((e: React.PointerEvent) => {
    if (!touches.current.has(e.pointerId)) return false;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return false;
    if (g.kind === 'pinch' && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()];
      const k = clamp(g.k0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), 1, MAX_K);
      const mid = toView((a.x + b.x) / 2, (a.y + b.y) / 2);
      setFree(clampRegion({ k, x: g.p0.x - mid.x / k, y: g.p0.y - mid.y / k }));
      setMode('free');
    } else if (g.kind === 'pan') {
      const a = toView(g.c0.x, g.c0.y), b = toView(e.clientX, e.clientY);
      setFree(clampRegion({ k: g.r0.k, x: g.r0.x - (b.x - a.x) / g.r0.k, y: g.r0.y - (b.y - a.y) / g.r0.k }));
    }
    return true;
  }, [toView]);

  const up = useCallback((e: React.PointerEvent) => {
    if (!touches.current.delete(e.pointerId)) return false;
    const was = gesture.current;
    if (touches.current.size < 2 && was?.kind === 'pinch') gesture.current = null;
    if (touches.current.size === 0) { gesture.current = null; setGesturing(false); }
    return !!was;
  }, []);

  const show = useCallback((m: CamMode) => {
    if (m === 'free') return;
    last.current = null;
    setMode(m);
  }, []);

  return { phone, mode, view, gesturing, show, gestures: { down, move, up } };
}

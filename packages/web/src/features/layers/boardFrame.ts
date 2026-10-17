// A6 (Dev A): geometry shared by the board layers. A layer frame is laid exactly over the main
// board svg (#chalk-board) inside .board-wrap, so board pixels map to percentages of the frame.
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { BOARD_H, BOARD_W, type Camera } from '@chalk/board';

export const BOARD_ID = 'chalk-board';

export interface Frame { left: number; top: number; width: number; height: number }

/** The svg's box relative to the layer's offset parent (.board-wrap), kept fresh on resize. */
export function useBoardFrame(ref: RefObject<HTMLElement | null>): Frame | null {
  const [frame, setFrame] = useState<Frame | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    const svg = document.getElementById(BOARD_ID);
    if (!el || !parent || !svg) return;
    const measure = () => {
      const a = svg.getBoundingClientRect();
      const b = parent.getBoundingClientRect();
      const next = { left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height };
      setFrame((f) => f && f.left === next.left && f.top === next.top && f.width === next.width && f.height === next.height ? f : next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    ro.observe(svg);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [ref]);
  return frame;
}

export const frameStyle = (f: Frame | null): CSSProperties =>
  f ? { left: f.left, top: f.top, width: f.width, height: f.height } : { visibility: 'hidden' };

/** Board pixels (page space) to percentages of the frame, through the board camera. */
export const toPct = (cam: Camera, x: number, y: number) => ({
  x: ((x - cam.x) * cam.zoom / BOARD_W) * 100,
  y: ((y - cam.y) * cam.zoom / BOARD_H) * 100,
});

/** Screen point to board pixels (page space), or null when outside the board. */
export function clientToBoard(cam: Camera, clientX: number, clientY: number) {
  const svg = document.getElementById(BOARD_ID);
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  const u = (clientX - r.left) / r.width, v = (clientY - r.top) / r.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { x: (u * BOARD_W) / cam.zoom + cam.x, y: (v * BOARD_H) / cam.zoom + cam.y };
}

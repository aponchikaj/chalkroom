// AM: class materials shared state: a title cache for citation chips, and the "open this
// source" request a chip sends to whichever materials list is on screen (the classroom rail
// listens and switches to its Materials tab).
import { create } from 'zustand';
import type { SourceRow } from '@chalk/schema';
import { api } from '../../lib/api';

export interface SourceFocus { id: string; page: number | null; n: number }

interface MaterialsStore {
  titles: Record<string, string>;
  focus: SourceFocus | null;
}

export const useMaterials = create<MaterialsStore>(() => ({ titles: {}, focus: null }));

/** Remember source titles so chips can name them. */
export function rememberSources(rows: SourceRow[]) {
  const cur = useMaterials.getState().titles;
  if (rows.every((r) => cur[r.id] === r.title)) return;
  useMaterials.setState({ titles: { ...cur, ...Object.fromEntries(rows.map((r) => [r.id, r.title])) } });
}

/** A citation chip was pressed: ask the materials list on screen to show this source. */
export function openSource(id: string, page: number | null = null) {
  const n = (useMaterials.getState().focus?.n ?? 0) + 1;
  useMaterials.setState({ focus: { id, page, n } });
}

const primed = new Set<string>();
/** Fill the title cache for a room once per visit; failures are ignored (chips fall back). */
export function primeSources(roomId: string) {
  if (primed.has(roomId)) return;
  primed.add(roomId);
  api.sources(roomId).then(rememberSources).catch(() => primed.delete(roomId));
}

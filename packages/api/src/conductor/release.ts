// Which conductors the heartbeat may let go: idle ones whose room is not live (in the lobby,
// ended, or deleted). They come back on demand (ConductorService.for) when someone acts.
import type { Phase } from '@chalk/schema';

export function releasable(ids: string[], phases: Map<string, Phase | string>, idle: (id: string) => boolean): string[] {
  return ids.filter((id) => {
    if (!idle(id)) return false;
    const phase = phases.get(id);
    return phase === undefined || phase === 'lobby' || phase === 'ended';
  });
}

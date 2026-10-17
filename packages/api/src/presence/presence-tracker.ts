// packages/api/src/presence/presence-tracker.ts
// Pure presence bookkeeping: a member absent from Supabase Presence for leaveMs has left;
// a member who reappears is back. Time is passed in, so tests need no timers.
import type { MemberRow } from '@chalk/schema';

export interface PresenceMember { userId: string; active: boolean }

export class PresenceTracker {
  private missingSince = new Map<string, number>();
  constructor(private leaveMs: number) {}

  /** Someone is missing and counting down to "left": the next sync must read the members. */
  waiting(): boolean { return this.missingSince.size > 0; }

  sync(present: Set<string>, members: PresenceMember[], now: number): { leave: string[]; back: string[] } {
    const leave: string[] = [];
    const back: string[] = [];
    for (const m of members) {
      if (present.has(m.userId)) {
        this.missingSince.delete(m.userId);
        if (!m.active) back.push(m.userId);
        continue;
      }
      if (!m.active) { this.missingSince.delete(m.userId); continue; }
      const since = this.missingSince.get(m.userId);
      if (since === undefined) this.missingSince.set(m.userId, now);
      else if (now - since >= this.leaveMs) { leave.push(m.userId); this.missingSince.delete(m.userId); }
    }
    return { leave, back };
  }
}

/** Host handoff: the active member who joined first, excluding the host. */
export function pickSuccessor(active: MemberRow[], hostId: string): MemberRow | null {
  return active.filter((m) => m.user_id !== hostId).sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0] ?? null;
}

/** Stop watching a room that was deleted (`phase` null), has ended, or that everyone left
 *  (no active member and nobody present). It is watched again when someone joins. */
export function shouldUnwatch(phase: string | null, members: PresenceMember[], present: Set<string>): boolean {
  if (phase === null || phase === 'ended') return true;
  return !members.some((m) => m.active) && present.size === 0;
}

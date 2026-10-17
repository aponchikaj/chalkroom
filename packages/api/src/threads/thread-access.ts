// packages/api/src/threads/thread-access.ts
// Pure permission rules for joined threads (lane Q). No DB, so they are unit-tested.
import type { MemberRow, ThreadRow } from '@chalk/schema';

type Thread = Pick<ThreadRow, 'owner_id' | 'status' | 'members'>;

/** Why `userId` may not join, as [http status, message], or null when the join may go ahead. */
export function joinRefusal(t: Thread, userId: string, member: Pick<MemberRow, 'banned'> | null): [403 | 409, string] | null {
  if (!member || member.banned) return [403, 'not a member of this room'];
  if (t.owner_id === userId) return [409, 'this is your own thread'];
  if (t.status !== 'open') return [409, 'this thread is not open'];
  return null;
}

/** The owner and every classmate who joined may write in a thread. */
export function canPost(t: Thread, userId: string): boolean {
  return t.owner_id === userId || (t.members ?? []).includes(userId);
}

/** Members after a join: idempotent, in joining order. */
export function withMember(t: Thread, userId: string): string[] {
  const now = t.members ?? [];
  return now.includes(userId) ? now : [...now, userId];
}

// Thread lane UI state shared with other features, outside the room store:
// - closeError: "Back to class" closes the drawer at once; when the close call then fails the
//   drawer reopens and shows this message.
// - peeked / expanded: which threads this person looked at and which sections they opened,
//   remembered per class for the session.
import { create } from 'zustand';

interface ThreadUi {
  closeError: { threadId: string; text: string } | null;
}

export const useThreadUi = create<ThreadUi>(() => ({ closeError: null }));

const key = (roomId: string, what: string) => `chalkroom.threads.${what}.${roomId}`;

function read<T>(k: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(k: string, v: unknown) {
  try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: choices last for this view only */ }
}

export const readPeeked = (roomId: string) => read<string[]>(key(roomId, 'peeked'), []);
export function rememberPeek(roomId: string, threadId: string) {
  const list = readPeeked(roomId);
  if (!list.includes(threadId)) write(key(roomId, 'peeked'), [...list, threadId]);
}

export const readExpanded = (roomId: string) => read<Record<string, boolean>>(key(roomId, 'expanded'), {});
export const writeExpanded = (roomId: string, map: Record<string, boolean>) => write(key(roomId, 'expanded'), map);

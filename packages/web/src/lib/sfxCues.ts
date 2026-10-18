// Lane V: the class moments that make a sound effect (lib/sfx.ts), read from the room store so
// no screen has to call play() itself. The page turn comes from the board player (lib/player.ts).
//   bell    a check opens
//   sticky  a new group of questions lands on the board
//   pencil  this person's question, check answer or note edit is written down
// Only changes inside a live class count: the first snapshot of a room, a reconnect's snapshot and
// a different room make no sound. play() itself adds the person's switch, reduced motion, a
// hidden tab, the teaching-page rule and the one-tab voice owner rule.
import { useRoom, type RoomStore } from '../room/store';
import { play } from './sfx';

const NOTE_PENCIL_GAP_MS = 4000;
let lastNotePencil = 0;

const added = <T>(prev: Record<string, T>, next: Record<string, T>, keep: (row: T) => boolean = () => true) =>
  prev === next ? false : Object.keys(next).some((k) => !(k in prev) && keep(next[k]));

function cue(next: RoomStore, prev: RoomStore) {
  if (prev.conn !== 'live' || next.conn !== 'live') return;
  if (!prev.room || !next.room || prev.room.id !== next.room.id) return;
  const me = next.me;

  if (next.check && next.check.checkId !== prev.check?.checkId) play('bell');
  if (added(prev.clusters, next.clusters)) play('sticky');

  const wrote = added(prev.answered, next.answered)
    || (!!me && added(prev.questions, next.questions, (q) => q.author_id === me));
  if (wrote) { play('pencil'); return; }

  if (me && prev.notes !== next.notes) {
    const edited = Object.values(next.notes).some((b) => b.edited_by === me && prev.notes[b.id]?.version !== b.version);
    const now = Date.now();
    if (edited && now - lastNotePencil > NOTE_PENCIL_GAP_MS) { lastNotePencil = now; play('pencil'); }
  }
}

let installed = false;
/** Start listening (runs on import; safe to call again). */
export function installSoundCues() {
  if (installed) return;
  installed = true;
  useRoom.subscribe(cue);
}

installSoundCues();

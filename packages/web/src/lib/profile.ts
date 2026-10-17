// The name and colour a classroom shows for me (from the account profile), and the rooms
// this browser has joined so a refresh goes straight back in.
export interface Profile { name: string; color: string }
/** Rooms this browser has joined, so a refresh goes straight back in. */
export const joined = {
  has: (code: string) => { try { return localStorage.getItem(`chalkroom.joined.${code}`) === '1'; } catch { return false; } },
  add: (code: string) => { try { localStorage.setItem(`chalkroom.joined.${code}`, '1'); } catch { /* ignore */ } },
};

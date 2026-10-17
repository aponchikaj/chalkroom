// The name and colour this browser joins with, remembered for next time.
import { MEMBER_COLORS } from '@chalk/schema';

export interface Profile { name: string; color: string }
const KEY = 'chalkroom.profile';

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (p?.name && p?.color) return p;
  } catch { /* first visit or storage blocked */ }
  return { name: '', color: MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)] };
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

/** Rooms this browser has joined, so a refresh goes straight back in. */
export const joined = {
  has: (code: string) => { try { return localStorage.getItem(`chalkroom.joined.${code}`) === '1'; } catch { return false; } },
  add: (code: string) => { try { localStorage.setItem(`chalkroom.joined.${code}`, '1'); } catch { /* ignore */ } },
};

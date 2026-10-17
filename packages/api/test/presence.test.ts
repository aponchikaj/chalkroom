// packages/api/test/presence.test.ts
import { describe, it, expect } from 'vitest';
import type { MemberRow } from '@chalk/schema';
import { PresenceTracker, pickSuccessor } from '../src/presence/presence-tracker';

describe('PresenceTracker', () => {
  it('marks a member left only after leaveMs of absence', () => {
    const t = new PresenceTracker(15_000);
    const members = [{ userId: 'a', active: true }, { userId: 'b', active: true }];
    expect(t.sync(new Set(['a']), members, 0)).toEqual({ leave: [], back: [] });
    expect(t.sync(new Set(['a']), members, 14_999)).toEqual({ leave: [], back: [] });
    expect(t.sync(new Set(['a']), members, 15_000)).toEqual({ leave: ['b'], back: [] });
  });
  it('forgets the absence when the member returns in time', () => {
    const t = new PresenceTracker(15_000);
    const members = [{ userId: 'b', active: true }];
    t.sync(new Set(), members, 0);
    t.sync(new Set(['b']), members, 5_000);
    expect(t.sync(new Set(), members, 16_000)).toEqual({ leave: [], back: [] });
  });
  it('reports an inactive member who is present again', () => {
    const t = new PresenceTracker(15_000);
    expect(t.sync(new Set(['b']), [{ userId: 'b', active: false }], 0)).toEqual({ leave: [], back: ['b'] });
  });
});

describe('pickSuccessor', () => {
  const m = (user_id: string, joined_at: string) => ({ user_id, joined_at } as MemberRow);
  it('picks the longest-present member who is not the host', () => {
    expect(pickSuccessor([m('h', '2026-01-01'), m('x', '2026-01-03'), m('y', '2026-01-02')], 'h')?.user_id).toBe('y');
  });
  it('returns null when nobody else is here', () => {
    expect(pickSuccessor([m('h', '2026-01-01')], 'h')).toBeNull();
  });
});

describe('shouldUnwatch', () => {
  it('stops watching deleted, ended and empty rooms', async () => {
    const { shouldUnwatch } = await import('../src/presence/presence-tracker');
    expect(shouldUnwatch(null, [], new Set())).toBe(true); // deleted
    expect(shouldUnwatch('ended', [{ userId: 'a', active: true }], new Set(['a']))).toBe(true);
    expect(shouldUnwatch('lobby', [{ userId: 'a', active: false }], new Set())).toBe(true); // everyone gone
    expect(shouldUnwatch('lobby', [{ userId: 'a', active: true }], new Set())).toBe(false); // may be absent briefly
    expect(shouldUnwatch('check', [{ userId: 'a', active: false }], new Set(['a']))).toBe(false); // someone is back
  });
});

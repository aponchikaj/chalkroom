// packages/api/test/thread-access.test.ts (lane Q)
import { describe, it, expect } from 'vitest';
import { canPost, joinRefusal, withMember } from '../src/threads/thread-access';
import { chatHistory, learnerLine } from '../src/threads/thread-context';
import type { StreamEvent } from '@chalk/schema';

const t = { owner_id: 'nika', status: 'open' as const, members: [] as string[] };

describe('joinRefusal', () => {
  it('lets a classmate join an open thread', () => {
    expect(joinRefusal(t, 'ana', { banned: false })).toBeNull();
  });
  it('refuses non-members, banned members, the owner and threads that are not open', () => {
    expect(joinRefusal(t, 'ana', null)?.[0]).toBe(403);
    expect(joinRefusal(t, 'ana', { banned: true })?.[0]).toBe(403);
    expect(joinRefusal(t, 'nika', { banned: false })?.[0]).toBe(409);
    expect(joinRefusal({ ...t, status: 'offered' }, 'ana', { banned: false })?.[0]).toBe(409);
    expect(joinRefusal({ ...t, status: 'closed' }, 'ana', { banned: false })?.[0]).toBe(409);
  });
});

describe('canPost and withMember', () => {
  it('lets the owner and joined members post', () => {
    expect(canPost(t, 'nika')).toBe(true);
    expect(canPost(t, 'ana')).toBe(false);
    const joined = { ...t, members: withMember(t, 'ana') };
    expect(canPost(joined, 'ana')).toBe(true);
    expect(canPost({ ...t, members: undefined }, 'ana')).toBe(false);
  });
  it('joins once', () => {
    const once = { ...t, members: withMember(t, 'ana') };
    expect(withMember(once, 'ana')).toBe(once.members);
    expect(withMember(once, 'gio')).toEqual(['ana', 'gio']);
  });
});

describe('labelled history', () => {
  let seq = 0;
  const ev = (data: unknown) => ({ stream_id: 's', room_id: 'r', seq: ++seq, kind: 'chat', data, actor: 'x', t: '' } as StreamEvent);
  it('says who wrote each learner line once classmates joined', () => {
    const names = { nika: 'Nika', ana: 'Ana' };
    const h = chatHistory([
      ev({ role: 'learner', markdown: 'Why 255?', authorId: 'nika' }),
      ev({ role: 'learner', markdown: 'And why down?', authorId: 'ana' }),
      ev({ role: 'tutor', markdown: 'Because...' }),
    ], names);
    expect(h).toEqual([
      { role: 'user', content: '[Nika] Why 255?\n\n[Ana] And why down?' },
      { role: 'assistant', content: 'Because...' },
    ]);
    expect(learnerLine('hi', 'ana', undefined)).toBe('hi');
  });
});

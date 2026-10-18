// Class library (lane C): the next session booking, replays and kudos over HTTP.
import { afterAll, describe, expect, it } from 'vitest';
import type { RoomRow } from '@chalk/schema';
import { api, closeAll, createRoom, joinRoom, newUser, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

describe('POST /rooms/:id/next', () => {
  it('books the next session (201), then moves that booking (200)', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    const first = await api<RoomRow>(ana, 'POST', `/rooms/${room.id}/next`, { startsAt: inDays(1) });
    expect(first.status).toBe(201);
    const later = inDays(2);
    const moved = await api<RoomRow>(ana, 'POST', `/rooms/${room.id}/next`, { startsAt: later });
    expect(moved.status).toBe(200);
    expect(moved.body.id).toBe(first.body.id);
    expect(new Date(moved.body.starts_at!).getTime()).toBe(new Date(later).getTime());
  });

  it('is host only (403)', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const { room } = await createRoom(ana);
    await joinRoom(gio, room.invite_code);
    expect((await api(gio, 'POST', `/rooms/${room.id}/next`, { startsAt: inDays(1) })).status).toBe(403);
  });
});

describe('replays and kudos', () => {
  it('list replays and kudos for a signed-in user', async () => {
    const ana = await user('Ana');
    expect((await api(ana, 'GET', '/replays')).status).toBe(200);
    expect((await api(ana, 'GET', '/me/kudos')).status).toBe(200);
  });
});

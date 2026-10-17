// Host moderation (B6): mute (no asking), unmute, kick (no rejoin, no reading the room).
import { afterAll, describe, expect, it } from 'vitest';
import type { MemberRow } from '@chalk/schema';
import { api, closeAll, createRoom, joinRoom, newUser, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

async function setup() {
  const ana = await user('Ana');
  const gio = await user('Gio');
  const { room } = await createRoom(ana);
  await joinRoom(gio, room.invite_code);
  return { ana, gio, room };
}

describe('POST /rooms/:id/moderate', () => {
  it('mute stops a member asking; unmute lets them ask again', async () => {
    const { ana, gio, room } = await setup();
    expect((await api(ana, 'POST', `/rooms/${room.id}/moderate`, { userId: gio.id, action: 'mute' })).status).toBe(204);
    const r = await api(gio, 'POST', `/rooms/${room.id}/questions`, { text: 'hi' });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/muted/);
    const m = (await gio.sb.from('room_members').select('muted').eq('room_id', room.id).eq('user_id', gio.id).single()).data as MemberRow;
    expect(m.muted).toBe(true);
    await api(ana, 'POST', `/rooms/${room.id}/moderate`, { userId: gio.id, action: 'unmute' });
    expect((await api(gio, 'POST', `/rooms/${room.id}/questions`, { text: 'hi' })).status).toBe(201);
  });

  it('kick removes a member: no rejoin, no reading the room', async () => {
    const { ana, gio, room } = await setup();
    expect((await api(ana, 'POST', `/rooms/${room.id}/moderate`, { userId: gio.id, action: 'kick' })).status).toBe(204);
    const rejoin = await api(gio, 'POST', '/rooms/join', { inviteCode: room.invite_code });
    expect(rejoin.status).toBe(403);
    expect(rejoin.body.message).toMatch(/removed/);
    expect((await gio.sb.from('rooms').select('id').eq('id', room.id)).data).toEqual([]);
    expect((await api(gio, 'POST', `/rooms/${room.id}/questions`, { text: 'hi' })).status).toBe(403);
  });

  it('is host only, never on yourself, and only on members', async () => {
    const { ana, gio, room } = await setup();
    expect((await api(gio, 'POST', `/rooms/${room.id}/moderate`, { userId: ana.id, action: 'mute' })).status).toBe(403);
    expect((await api(ana, 'POST', `/rooms/${room.id}/moderate`, { userId: ana.id, action: 'kick' })).status).toBe(400);
    expect((await api(ana, 'POST', `/rooms/${room.id}/moderate`, { userId: crypto.randomUUID(), action: 'mute' })).status).toBe(404);
    expect((await api(ana, 'POST', `/rooms/${room.id}/moderate`, { userId: gio.id, action: 'ban' })).status).toBe(400);
  });
});

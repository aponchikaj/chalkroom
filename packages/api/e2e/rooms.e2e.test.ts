// Rooms, membership, auth guard and validation: every rooms route, happy and error paths.
import { afterAll, describe, expect, it } from 'vitest';
import type { CreateRoomRes, RoomPreview } from '@chalk/schema';
import { api, closeAll, createRoom, joinRoom, newUser, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
const randomUuid = () => crypto.randomUUID();
afterAll(() => closeAll(users));

describe('GET /health', () => {
  it('answers without a token and names the model', async () => {
    const r = await api(null, 'GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, model: 'mock' });
  });
});

describe('auth guard', () => {
  it('returns 401 without a bearer token', async () => {
    const r = await api(null, 'POST', '/rooms', { title: 'x', displayName: 'A', color: '#f2d16b' });
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/missing bearer token/);
  });

  it('returns 401 for a token Supabase does not accept', async () => {
    const r = await api(null, 'POST', '/rooms', { title: 'x', displayName: 'A', color: '#f2d16b' }, 'not-a-jwt');
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/invalid token/);
  });
});

describe('POST /rooms', () => {
  it('creates a lobby room with the caller as host', async () => {
    const ana = await user('Ana');
    const r = await api<CreateRoomRes>(ana, 'POST', '/rooms', { title: 'Solana PDAs', displayName: 'Ana', color: ana.color });
    expect(r.status).toBe(201);
    const { room, inviteUrl } = r.body;
    expect(room).toMatchObject({ title: 'Solana PDAs', host_id: ana.id, phase: 'lobby', segment: 0, seats: 5, visibility: 'private', gate_held: false });
    expect(room.invite_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(room.main_stream_id).toBeTruthy();
    expect(inviteUrl.endsWith(`/r/${room.invite_code}`)).toBe(true);
    const members = await ana.sb.from('room_members').select('user_id, role, display_name').eq('room_id', room.id);
    expect(members.data).toEqual([{ user_id: ana.id, role: 'host', display_name: 'Ana' }]);
  });

  it.each([
    ['an empty title', { title: '', displayName: 'Ana', color: '#f2d16b' }, 'title'],
    ['a title over 80 characters', { title: 'x'.repeat(81), displayName: 'Ana', color: '#f2d16b' }, 'title'],
    // a missing display name is fine (the profile's is used); an empty one is not
    ['an empty display name', { title: 'x', displayName: '  ', color: '#f2d16b' }, 'displayName'],
    ['a color that is not #rrggbb', { title: 'x', displayName: 'Ana', color: 'red' }, 'color'],
    ['an unknown visibility', { title: 'x', displayName: 'Ana', color: '#f2d16b', visibility: 'secret' }, 'visibility'],
  ])('returns 400 for %s', async (_case, body, field) => {
    const ana = await user('Ana');
    const r = await api(ana, 'POST', '/rooms', body);
    expect(r.status).toBe(400);
    expect(r.body.message).toContain(field);
  });
});

describe('GET /rooms/code/:code', () => {
  it('previews a room without a token, case-insensitively', async () => {
    const host = await user('Host');
    const { room } = await createRoom(host);
    for (const code of [room.invite_code, room.invite_code.toLowerCase()]) {
      const r = await api<RoomPreview>(null, 'GET', `/rooms/code/${code}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ id: room.id, title: room.title, phase: 'lobby', seats: 5, taken: 1, hostName: 'Host' });
    }
  });

  it('returns 404 for an unknown code', async () => {
    const r = await api(null, 'GET', '/rooms/code/ZZZZZZ');
    expect(r.status).toBe(404);
  });
});

describe('POST /rooms/join', () => {
  it('adds a learner, and joining again keeps one seat', async () => {
    const host = await user('Host');
    const gio = await user('Gio');
    const { room } = await createRoom(host);
    const first = await joinRoom(gio, room.invite_code);
    expect(first.member).toMatchObject({ user_id: gio.id, role: 'learner', display_name: 'Gio', left_at: null });
    await joinRoom(gio, room.invite_code);
    const preview = await api<RoomPreview>(null, 'GET', `/rooms/code/${room.invite_code}`);
    expect(preview.body.taken).toBe(2);
  });

  it('returns 404 for an unknown code and 400 for a malformed body', async () => {
    const gio = await user('Gio');
    expect((await api(gio, 'POST', '/rooms/join', { inviteCode: 'ZZZZZZ', displayName: 'Gio', color: gio.color })).status).toBe(404);
    expect((await api(gio, 'POST', '/rooms/join', { inviteCode: 'ab', displayName: 'Gio', color: gio.color })).status).toBe(400);
  });

  it('returns 409 when all 5 seats are taken', async () => {
    const host = await user('Host');
    const { room } = await createRoom(host);
    for (let i = 1; i <= 4; i++) await joinRoom(await user(`L${i}`), room.invite_code);
    const late = await user('Late');
    const r = await api(late, 'POST', '/rooms/join', { inviteCode: room.invite_code, displayName: 'Late', color: late.color });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/full/);
  });
});

describe('POST /rooms/:id/leave', () => {
  it('frees the seat', async () => {
    const host = await user('Host');
    const gio = await user('Gio');
    const { room } = await createRoom(host);
    await joinRoom(gio, room.invite_code);
    expect((await api(gio, 'POST', `/rooms/${room.id}/leave`)).status).toBe(204);
    const preview = await api<RoomPreview>(null, 'GET', `/rooms/code/${room.invite_code}`);
    expect(preview.body.taken).toBe(1);
  });

  it('returns 400 for a room id that is not a uuid', async () => {
    const gio = await user('Gio');
    expect((await api(gio, 'POST', '/rooms/not-a-uuid/leave')).status).toBe(400);
  });
});

describe('host-only routes', () => {
  it('returns 403 when a learner starts the class or uses host controls', async () => {
    const host = await user('Host');
    const gio = await user('Gio');
    const { room } = await createRoom(host);
    await joinRoom(gio, room.invite_code);
    expect((await api(gio, 'POST', `/rooms/${room.id}/start`)).status).toBe(403);
    expect((await api(gio, 'POST', `/rooms/${room.id}/host`, { action: 'skip' })).status).toBe(403);
  });

  it('returns 400 for an unknown host action and 404 for an unknown room', async () => {
    const host = await user('Host');
    const { room } = await createRoom(host);
    expect((await api(host, 'POST', `/rooms/${room.id}/host`, { action: 'explode' })).status).toBe(400);
    expect((await api(host, 'POST', `/rooms/${randomUuid()}/start`)).status).toBe(404);
  });
});

describe('membership and RLS', () => {
  it('returns 403 for learner actions by a non-member', async () => {
    const host = await user('Host');
    const eve = await user('Eve');
    const { room } = await createRoom(host);
    expect((await api(eve, 'POST', `/rooms/${room.id}/ready`, { segment: 0 })).status).toBe(403);
    expect((await api(eve, 'POST', `/rooms/${room.id}/reactions`, { shapeId: 'pda', kind: 'confused' })).status).toBe(403);
    expect((await api(eve, 'POST', `/rooms/${room.id}/checks/${randomUuid()}/answer`, { answer: 1 })).status).toBe(403);
  });

  it('lets members read the room and hides it from strangers', async () => {
    const host = await user('Host');
    const eve = await user('Eve');
    const { room } = await createRoom(host);
    expect((await host.sb.from('rooms').select('id').eq('id', room.id)).data).toEqual([{ id: room.id }]);
    expect((await eve.sb.from('rooms').select('id').eq('id', room.id)).data).toEqual([]);
    expect((await eve.sb.from('events').select('seq').eq('room_id', room.id)).data).toEqual([]);
  });

  it('never lets anyone read hidden checks or anonymous votes', async () => {
    const host = await user('Host');
    const { room } = await createRoom(host);
    expect((await host.sb.from('checks').select('*').eq('room_id', room.id)).data).toEqual([]);
    expect((await host.sb.from('votes').select('*')).data).toEqual([]);
  });

  it('returns 409 for a ready vote while the room is in the lobby', async () => {
    const host = await user('Host');
    const { room } = await createRoom(host);
    expect((await api(host, 'POST', `/rooms/${room.id}/ready`, { segment: 0 })).status).toBe(409);
  });

  it('returns 404 for an answer to an unknown check', async () => {
    const host = await user('Host');
    const { room } = await createRoom(host);
    expect((await api(host, 'POST', `/rooms/${room.id}/checks/${randomUuid()}/answer`, { answer: 1 })).status).toBe(404);
  });
});

describe('POST /rooms/:id/reactions', () => {
  it('toggles a reaction on a shape', async () => {
    const host = await user('Host');
    const { room } = await createRoom(host);
    const read = () => host.sb.from('reactions').select('shape_id, kind').eq('room_id', room.id);
    expect((await api(host, 'POST', `/rooms/${room.id}/reactions`, { shapeId: 'pda', kind: 'confused' })).status).toBe(204);
    expect((await read()).data).toEqual([{ shape_id: 'pda', kind: 'confused' }]);
    await api(host, 'POST', `/rooms/${room.id}/reactions`, { shapeId: 'pda', kind: 'got_it' });
    expect((await read()).data).toEqual([{ shape_id: 'pda', kind: 'got_it' }]);
    await api(host, 'POST', `/rooms/${room.id}/reactions`, { shapeId: 'pda', kind: 'got_it' });
    expect((await read()).data).toEqual([]);
  });

  it('returns 400 for an unknown reaction kind', async () => {
    const host = await user('Host');
    const { room } = await createRoom(host);
    expect((await api(host, 'POST', `/rooms/${room.id}/reactions`, { shapeId: 'pda', kind: 'love' })).status).toBe(400);
  });
});

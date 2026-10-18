// A class that ended: learners keep the recap (members re-enter it), but the live actions stop
// with 409, and Start or the legacy host actions cannot run it again.
import { afterAll, describe, expect, it } from 'vitest';
import type { RoomRow } from '@chalk/schema';
import { api, atCheck, closeAll, createRoom, joinRoom, newUser, sleep, subscribe, waitRow, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

/** A class with a host and one learner, taught to the first check, then ended. */
async function endedClass() {
  const ana = await user('Ana');
  const gio = await user('Gio');
  const { room } = await createRoom(ana);
  await joinRoom(gio, room.invite_code);
  await subscribe(ana, room.id);
  expect((await api(ana, 'POST', `/rooms/${room.id}/start`)).status).toBe(202);
  await atCheck(ana, 0);
  expect((await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' })).status).toBe(202);
  await waitRow(ana, (r) => r.table === 'rooms' && r.row.phase === 'ended', 'the class ended');
  return { ana, gio, room };
}

describe('after the class ended', () => {
  it('refuses questions, reactions and new threads (409)', async () => {
    const { gio, room } = await endedClass();
    for (const [path, body] of [
      [`/rooms/${room.id}/questions`, { text: 'one more?' }],
      [`/rooms/${room.id}/reactions`, { shapeId: 'pda', kind: 'got_it' }],
      [`/rooms/${room.id}/threads`, { topic: 'later' }],
    ] as const) {
      const r = await api(gio, 'POST', path, body);
      expect(r.status, path).toBe(409);
      expect(r.body.message, path).toMatch(/ended/);
    }
  });

  it('lets a member back in (200) but refuses someone new (409)', async () => {
    const { gio, room } = await endedClass();
    const back = await api(gio, 'POST', '/rooms/join', { inviteCode: room.invite_code });
    expect(back.status).toBe(200);
    expect(back.body.room.phase).toBe('ended');
    const eve = await user('Eve');
    const r = await api(eve, 'POST', '/rooms/join', { inviteCode: room.invite_code });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/ended/);
  });

  it('refuses Start and the host actions (409)', async () => {
    const { ana, room } = await endedClass();
    expect((await api(ana, 'POST', `/rooms/${room.id}/start`)).status).toBe(409);
    expect((await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'skip' })).status).toBe(409);
    expect((await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' })).status).toBe(409);
  });

  it('says the class ended when an activity is asked for, and a running duel stops', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    await subscribe(ana, room.id);
    await api(ana, 'POST', `/rooms/${room.id}/start`);
    await atCheck(ana, 0);
    expect((await api(ana, 'POST', `/rooms/${room.id}/duel`, { count: 3, secondsPerQuestion: 60 })).status).toBe(201);
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
    await waitRow(ana, (r) => r.table === 'rooms' && r.row.phase === 'ended', 'the class ended');
    await sleep(500);
    const r = await api(ana, 'POST', `/rooms/${room.id}/teachback`, {});
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/ended/);
  });
});

describe('POST /rooms/:id/start', () => {
  it('refuses a class that already started (409)', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    await subscribe(ana, room.id);
    expect((await api(ana, 'POST', `/rooms/${room.id}/start`)).status).toBe(202);
    await waitRow(ana, (r) => r.table === 'rooms' && (r.row as RoomRow).phase === 'teaching', 'teaching');
    const r = await api(ana, 'POST', `/rooms/${room.id}/start`);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/already started/);
  });
});

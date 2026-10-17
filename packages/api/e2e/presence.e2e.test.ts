// Presence (B5): the API watches Supabase Presence; a learner gone for 15 s stops blocking the
// gate and comes back on return; the host role passes to the longest-present member.
import { afterAll, describe, expect, it } from 'vitest';
import type { MemberRow, RoomRow } from '@chalk/schema';
import { api, atCheck, closeAll, createRoom, joinRoom, newUser, subscribe, waitEvent, waitRow, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

const gone = (u: TestUser, who: string) => waitRow(u, (r) => r.table === 'room_members' && (r.row as MemberRow).user_id === who && (r.row as MemberRow).left_at !== null, 'marked as gone', 40_000);

describe('presence-aware gate', () => {
  it('stops waiting for a learner who closed the tab, and takes them back on return', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const { room } = await createRoom(ana);
    await joinRoom(gio, room.invite_code);
    await Promise.all([subscribe(ana, room.id), subscribe(gio, room.id)]);
    await api(ana, 'POST', `/rooms/${room.id}/start`);
    const check = await waitEvent(ana, (e) => e.kind === 'check', 'check');
    await atCheck(ana, 0);
    await api(ana, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });

    await gio.sb.removeChannel(gio.channel!); // Gio's tab closes
    await gone(ana, gio.id);
    await waitEvent(ana, (e) => e.kind === 'check_closed' && (e.data as { checkId: string }).checkId === (check.data as { checkId: string }).checkId, 'the gate passes without Gio');

    gio.rows = [];
    await subscribe(gio, room.id); // back
    await waitRow(ana, (r) => r.table === 'room_members' && (r.row as MemberRow).user_id === gio.id && (r.row as MemberRow).left_at === null, 'Gio back', 20_000);
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
  });
});

describe('host handoff', () => {
  it('passes the host role on when the host leaves the room', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const nika = await user('Nika');
    const { room } = await createRoom(ana);
    await joinRoom(gio, room.invite_code);
    await joinRoom(nika, room.invite_code);
    await Promise.all([subscribe(gio, room.id), subscribe(nika, room.id)]);
    expect((await api(ana, 'POST', `/rooms/${room.id}/leave`)).status).toBe(204);
    const r = await waitRow(nika, (x) => x.table === 'rooms' && (x.row as RoomRow).host_id === gio.id, 'Gio (longest present) is host');
    expect((r.row as RoomRow).host_id).toBe(gio.id);
    await waitEvent(nika, (e) => e.kind === 'notice' && /Gio is now the host/.test((e.data as { text: string }).text), 'the notice');
    expect((await api(gio, 'POST', `/rooms/${room.id}/host`, { action: 'end' })).status).toBe(202);
  });

  it('passes the host role on when the host drops (presence)', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const { room } = await createRoom(ana);
    await joinRoom(gio, room.invite_code);
    await Promise.all([subscribe(ana, room.id), subscribe(gio, room.id)]);
    await ana.sb.removeChannel(ana.channel!);
    await waitRow(gio, (x) => x.table === 'rooms' && (x.row as RoomRow).host_id === gio.id, 'host handed to Gio', 40_000);
    const members = (await gio.sb.from('room_members').select('user_id, role').eq('room_id', room.id)).data;
    expect(members).toEqual(expect.arrayContaining([{ user_id: gio.id, role: 'host' }, { user_id: ana.id, role: 'learner' }]));
  });
});

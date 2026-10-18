// Host tools (lane C) over HTTP: they need a live class (409 otherwise), and the check answers
// route only knows checks of this room.
import { afterAll, describe, expect, it } from 'vitest';
import { api, atCheck, closeAll, createRoom, newUser, subscribe, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

const TOOLS = [
  ['control', { action: 'pause' }],
  ['reexplain', { shapeIds: ['pda'] }],
  ['pin', { questionId: crypto.randomUUID() }],
] as const;

describe('host tools', () => {
  it('refuse a class that has not started (409)', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    for (const [tool, body] of TOOLS) {
      const r = await api(ana, 'POST', `/rooms/${room.id}/host/${tool}`, body);
      expect(r.status, tool).toBe(409);
      expect(r.body.message, tool).toMatch(/not started/);
    }
  });

  it('work while the class runs', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    await subscribe(ana, room.id);
    await api(ana, 'POST', `/rooms/${room.id}/start`);
    await atCheck(ana, 0);
    expect((await api(ana, 'POST', `/rooms/${room.id}/host/control`, { action: 'pause' })).status).toBe(202);
    expect((await api(ana, 'POST', `/rooms/${room.id}/host/control`, { action: 'resume' })).status).toBe(202);
  });

  it('answers 404 for a check that is not in this room', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    const r = await api(ana, 'GET', `/rooms/${room.id}/host/checks/${crypto.randomUUID()}/answers`);
    expect(r.status).toBe(404);
  });
});

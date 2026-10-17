// Questions and anonymous +1 votes.
import { afterAll, describe, expect, it } from 'vitest';
import type { QuestionRow } from '@chalk/schema';
import { api, closeAll, createRoom, joinRoom, newUser, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

describe('POST /rooms/:id/questions', () => {
  it('stores the question as pending with the author and segment', async () => {
    const host = await user('Ana');
    const { room } = await createRoom(host);
    const r = await api<QuestionRow>(host, 'POST', `/rooms/${room.id}/questions`, { text: '  Why can a PDA not sign?  ' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ room_id: room.id, author_id: host.id, author_name: 'Ana', text: 'Why can a PDA not sign?', segment: 0, status: 'pending', votes: 0, cluster_id: null });
    const seen = await host.sb.from('questions').select('id').eq('room_id', room.id);
    expect(seen.data).toEqual([{ id: r.body.id }]);
  });

  it('stores a shape anchor', async () => {
    const host = await user('Ana');
    const { room } = await createRoom(host);
    const anchor = { streamId: room.main_stream_id, shapeIds: ['pda'] };
    const r = await api<QuestionRow>(host, 'POST', `/rooms/${room.id}/questions`, { text: 'This one?', anchor });
    expect(r.body.anchor).toEqual(anchor);
  });

  it.each([
    ['empty text', { text: '   ' }],
    ['text over 500 characters', { text: 'x'.repeat(501) }],
    ['an anchor without shapes', { text: 'q', anchor: { streamId: 's', shapeIds: [] } }],
  ])('returns 400 for %s', async (_case, body) => {
    const host = await user('Ana');
    const { room } = await createRoom(host);
    expect((await api(host, 'POST', `/rooms/${room.id}/questions`, body)).status).toBe(400);
  });

  it('returns 403 for a non-member', async () => {
    const host = await user('Ana');
    const eve = await user('Eve');
    const { room } = await createRoom(host);
    expect((await api(eve, 'POST', `/rooms/${room.id}/questions`, { text: 'hi' })).status).toBe(403);
  });

  it('returns 429 after 6 questions in a minute from one user', async () => {
    const host = await user('Ana');
    const { room } = await createRoom(host);
    for (let i = 0; i < 6; i++) expect((await api(host, 'POST', `/rooms/${room.id}/questions`, { text: `q${i}` })).status).toBe(201);
    const r = await api(host, 'POST', `/rooms/${room.id}/questions`, { text: 'one more' });
    expect(r.status).toBe(429);
  });
});

describe('POST /questions/:id/vote', () => {
  it('toggles an anonymous +1 and keeps only the count visible', async () => {
    const host = await user('Ana');
    const gio = await user('Gio');
    const { room } = await createRoom(host);
    await joinRoom(gio, room.invite_code);
    const q = (await api<QuestionRow>(host, 'POST', `/rooms/${room.id}/questions`, { text: 'Why?' })).body;
    const votes = async () => (await host.sb.from('questions').select('votes').eq('id', q.id).single()).data?.votes;

    expect((await api(gio, 'POST', `/questions/${q.id}/vote`)).status).toBe(204);
    expect(await votes()).toBe(1);
    expect((await gio.sb.from('votes').select('*').eq('question_id', q.id)).data).toEqual([]); // who voted stays hidden
    await api(gio, 'POST', `/questions/${q.id}/vote`);
    expect(await votes()).toBe(0);
  });

  it('returns 403 for a non-member and 404 for an unknown question', async () => {
    const host = await user('Ana');
    const eve = await user('Eve');
    const { room } = await createRoom(host);
    const q = (await api<QuestionRow>(host, 'POST', `/rooms/${room.id}/questions`, { text: 'Why?' })).body;
    expect((await api(eve, 'POST', `/questions/${q.id}/vote`)).status).toBe(403);
    expect((await api(host, 'POST', `/questions/${crypto.randomUUID()}/vote`)).status).toBe(404);
  });
});

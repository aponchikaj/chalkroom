// Threads (B4): one personal side tutor per learner, its own stream, excused at the gate.
import { afterAll, describe, expect, it } from 'vitest';
import type { ClusterRow, QuestionRow, StreamEvent, ThreadRow } from '@chalk/schema';
import { api, atCheck, closeAll, createRoom, joinRoom, newUser, subscribe, waitEvent, waitRow, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

const chats = (u: TestUser, streamId: string) => u.events.filter((e) => e.stream_id === streamId && e.kind === 'chat') as StreamEvent<'chat'>[];

async function roomWith(names: string[]) {
  const [host, ...rest] = await Promise.all(names.map(user));
  const { room } = await createRoom(host);
  for (const u of rest) await joinRoom(u, room.invite_code);
  await Promise.all([host, ...rest].map((u) => subscribe(u, room.id)));
  return { room, host, rest };
}

describe('open and message', () => {
  it('opens a thread with a greeting, and the tutor replies on its stream', async () => {
    const { room, host: ana } = await roomWith(['Ana']);
    const r = await api<ThreadRow>(ana, 'POST', `/rooms/${room.id}/threads`, { topic: 'bump seeds' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ room_id: room.id, owner_id: ana.id, topic: 'bump seeds', status: 'open' });
    expect(typeof Number(r.body.left_main_seq)).toBe('number');
    await waitEvent(ana, (e) => e.stream_id === r.body.stream_id && e.kind === 'chat', 'the greeting', 30_000);

    expect((await api(ana, 'POST', `/threads/${r.body.id}/messages`, { text: 'Why does it start at 255?' })).status).toBe(202);
    await waitEvent(ana, (e) => e.stream_id === r.body.stream_id && e.kind === 'chat' && (e.data as { role: string }).role === 'tutor' && e.seq >= 3, 'the tutor reply', 30_000);
    const lines = chats(ana, r.body.stream_id).map((e) => e.data.role);
    expect(lines.slice(0, 3)).toEqual(['tutor', 'learner', 'tutor']);
    await waitEvent(ana, (e) => e.stream_id === r.body.stream_id && e.kind === 'board', 'mini board steps', 30_000);
  });

  it('opens from your own question and marks it `thread`', async () => {
    const { room, host: ana } = await roomWith(['Ana']);
    const q = (await api<QuestionRow>(ana, 'POST', `/rooms/${room.id}/questions`, { text: 'How do PDAs sign?' })).body;
    const t = await api<ThreadRow>(ana, 'POST', `/rooms/${room.id}/threads`, { questionId: q.id });
    expect(t.status).toBe(201);
    expect(t.body.topic).toBe('How do PDAs sign?');
    expect((await ana.sb.from('questions').select('status').eq('id', q.id).single()).data?.status).toBe('thread');
  });

  it('refuses a second open thread (409), strangers (403), and other learners\' questions (403)', async () => {
    const { room, host: ana, rest: [gio] } = await roomWith(['Ana', 'Gio']);
    const eve = await user('Eve');
    const t = (await api<ThreadRow>(ana, 'POST', `/rooms/${room.id}/threads`, { topic: 'x' })).body;
    expect((await api(ana, 'POST', `/rooms/${room.id}/threads`, { topic: 'y' })).status).toBe(409);
    expect((await api(eve, 'POST', `/rooms/${room.id}/threads`, { topic: 'y' })).status).toBe(403);
    expect((await api(gio, 'POST', `/threads/${t.id}/messages`, { text: 'hi' })).status).toBe(403);
    expect((await api(gio, 'POST', `/threads/${t.id}/close`)).status).toBe(403);
    const q = (await api<QuestionRow>(ana, 'POST', `/rooms/${room.id}/questions`, { text: 'mine' })).body;
    expect((await api(gio, 'POST', `/rooms/${room.id}/threads`, { questionId: q.id })).status).toBe(403);
    expect((await api(ana, 'POST', `/threads/${crypto.randomUUID()}/close`)).status).toBe(404);
  });
});

describe('offers', () => {
  it('accepts a thread offered by triage', async () => {
    const { room, host: nika } = await roomWith(['Nika']);
    for (const text of ['How is the bump seed chosen?', 'Why does the bump seed start at 255?', 'Can the bump seed ever be 0?']) {
      await api(nika, 'POST', `/rooms/${room.id}/questions`, { text });
      await new Promise((r) => setTimeout(r, 4_600)); // one triage batch each
    }
    const offer = (await waitRow(nika, (r) => r.table === 'threads' && r.row.status === 'offered', 'an offer')).row as ThreadRow;
    // accepting and opening a new thread at once: one wins, the other is a 409 (never a 500)
    const [r, raced] = await Promise.all([
      api<ThreadRow>(nika, 'POST', `/rooms/${room.id}/threads`, { threadId: offer.id }),
      api<ThreadRow>(nika, 'POST', `/rooms/${room.id}/threads`, { topic: 'at the same time' }),
    ]);
    expect([r.status, raced.status].sort()).toEqual(r.status === 200 ? [200, 409] : [201, 409]);
    if (r.status !== 200) {
      // the new thread won the race; close it and accept the offer
      await api(nika, 'POST', `/threads/${raced.body.id}/close`);
      Object.assign(r, await api<ThreadRow>(nika, 'POST', `/rooms/${room.id}/threads`, { threadId: offer.id }));
    }
    // accepting an offer updates the thread: 200, not 201
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: offer.id, status: 'open' });
    expect(r.body.left_main_seq).not.toBeNull();
    expect((await api(nika, 'POST', `/rooms/${room.id}/threads`, { threadId: offer.id })).status).toBe(409); // not on offer anymore
  });
});

describe('the class keeps going', () => {
  it('passes the gate without the owner of an open thread', async () => {
    const { room, host: ana, rest: [gio] } = await roomWith(['Ana', 'Gio']);
    await api(ana, 'POST', `/rooms/${room.id}/start`);
    const check = await waitEvent(ana, (e) => e.kind === 'check', 'the check');
    await atCheck(ana, 0);
    await api(gio, 'POST', `/rooms/${room.id}/threads`, { topic: 'bump seeds' });
    await api(ana, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
    await waitEvent(ana, (e) => e.kind === 'check_closed' && (e.data as { checkId: string }).checkId === (check.data as { checkId: string }).checkId, 'gate passed without Gio');
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
  });
});

describe('close and share', () => {
  it('closes the thread', async () => {
    const { room, host: ana } = await roomWith(['Ana']);
    const t = (await api<ThreadRow>(ana, 'POST', `/rooms/${room.id}/threads`, { topic: 'x' })).body;
    expect((await api(ana, 'POST', `/threads/${t.id}/close`)).status).toBe(204);
    await waitRow(ana, (r) => r.table === 'threads' && (r.row as ThreadRow).id === t.id && (r.row as ThreadRow).status === 'closed', 'closed');
    expect((await api(ana, 'POST', `/threads/${t.id}/messages`, { text: 'hi' })).status).toBe(409);
    // closing frees the learner for a new thread
    expect((await api(ana, 'POST', `/rooms/${room.id}/threads`, { topic: 'y' })).status).toBe(201);
  });

  it('shares the last tutor answer to the class as an answered cluster', async () => {
    const { room, host: ana } = await roomWith(['Ana']);
    const t = (await api<ThreadRow>(ana, 'POST', `/rooms/${room.id}/threads`, { topic: 'bump seeds' })).body;
    expect((await api(ana, 'POST', `/threads/${t.id}/share`)).status).toBe(409); // nothing answered yet
    await api(ana, 'POST', `/threads/${t.id}/messages`, { text: 'Why 255?' });
    await waitEvent(ana, (e) => e.stream_id === t.stream_id && e.kind === 'chat' && (e.data as { role: string }).role === 'tutor' && e.seq >= 3, 'reply');
    const r = await api<ClusterRow>(ana, 'POST', `/threads/${t.id}/share`);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ room_id: room.id, title: 'bump seeds', route: 'inline', answered: true, asker_count: 1 });
    expect(r.body.answer).toContain('255');
    const row = (await ana.sb.from('threads').select('shared_answer').eq('id', t.id).single()).data;
    expect(row?.shared_answer).toBe(r.body.answer);
  });
});

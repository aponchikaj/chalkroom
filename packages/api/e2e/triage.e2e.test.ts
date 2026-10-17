// Triage (B2): every question leaves `pending` within ~5 s; similar questions group into one
// class cluster answered (with credit) in the Q&A beat; a learner's third question on one
// subtopic offers them a thread. Mock triage clusters by word overlap.
import { afterAll, describe, expect, it } from 'vitest';
import type { ClusterRow, QuestionRow, ThreadRow } from '@chalk/schema';
import { api, atCheck, closeAll, createRoom, joinRoom, newUser, subscribe, waitEvent, waitRow, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

const ask = (u: TestUser, roomId: string, text: string) => api<QuestionRow>(u, 'POST', `/rooms/${roomId}/questions`, { text });
const question = async (u: TestUser, id: string) => (await u.sb.from('questions').select('*').eq('id', id).single()).data as QuestionRow;

describe('triage', () => {
  it('answers a lone question inline within about 5 s', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    const t0 = Date.now();
    const q = (await ask(ana, room.id, 'What is a seed?')).body;
    let row = await question(ana, q.id);
    while (row.status === 'pending' && Date.now() - t0 < 6_000) { await new Promise((r) => setTimeout(r, 200)); row = await question(ana, q.id); }
    expect(row.status).toBe('answered');
    expect(Date.now() - t0).toBeLessThan(6_000);
    const c = (await ana.sb.from('clusters').select('*').eq('id', row.cluster_id!).single()).data as ClusterRow;
    expect(c).toMatchObject({ route: 'inline', asker_count: 1 });
    expect(c.answer).toBeTruthy();
  });

  it('groups two learners into one class cluster and credits both in the Q&A beat', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const { room } = await createRoom(ana);
    await joinRoom(gio, room.invite_code);
    await Promise.all([subscribe(ana, room.id), subscribe(gio, room.id)]);
    await api(ana, 'POST', `/rooms/${room.id}/start`);
    const check = await waitEvent(gio, (e) => e.kind === 'check', 'first check');
    await atCheck(gio, 0);

    await ask(gio, room.id, 'Why can a PDA not sign?');
    await ask(ana, room.id, "Why can't a PDA sign transactions?");
    const cluster = (await waitRow(ana, (r) => r.table === 'clusters' && r.row.route === 'class' && r.row.asker_count === 2, 'a class cluster with 2 askers')).row as ClusterRow;
    const qs = await ana.sb.from('questions').select('status, cluster_id').eq('room_id', room.id);
    expect(qs.data).toEqual([{ status: 'grouped', cluster_id: cluster.id }, { status: 'grouped', cluster_id: cluster.id }]);

    const checkId = (check.data as { checkId: string }).checkId;
    await api(ana, 'POST', `/rooms/${room.id}/checks/${checkId}/answer`, { answer: 1 });
    await api(ana, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
    await api(gio, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
    const qa = await waitEvent(gio, (e) => e.kind === 'answer_cluster', 'the Q&A answer');
    expect((qa.data as { askers: string[] }).askers.sort()).toEqual(['Ana', 'Gio']);
    await waitRow(ana, (r) => r.table === 'clusters' && (r.row as ClusterRow).id === cluster.id && (r.row as ClusterRow).answered, 'cluster answered');
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
  });

  it('runs at the gate: a question asked during the check is routed before the Q&A beat', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    await subscribe(ana, room.id);
    await api(ana, 'POST', `/rooms/${room.id}/start`);
    await atCheck(ana, 0);
    const q = (await ask(ana, room.id, 'Is the bump always 255?')).body;
    await api(ana, 'POST', `/rooms/${room.id}/ready`, { segment: 0 }); // gate passes at once (1 member)
    await waitEvent(ana, (e) => e.kind === 'segment_start' && (e.data as { segment: number }).segment === 1, 'segment 1');
    expect((await question(ana, q.id)).status).not.toBe('pending');
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
  });

  it('offers a thread on the third question about one subtopic', async () => {
    const nika = await user('Nika');
    const { room } = await createRoom(nika);
    await subscribe(nika, room.id);
    for (const text of ['How is the bump seed chosen?', 'Why does the bump seed start at 255?']) {
      const q = (await ask(nika, room.id, text)).body;
      let row = await question(nika, q.id);
      const t0 = Date.now();
      while (row.status === 'pending' && Date.now() - t0 < 6_000) { await new Promise((r) => setTimeout(r, 200)); row = await question(nika, q.id); }
    }
    const third = (await ask(nika, room.id, 'Can the bump seed ever be 0?')).body;
    const offer = await waitRow(nika, (r) => r.table === 'threads' && r.row.status === 'offered', 'a thread offer');
    expect((offer.row as ThreadRow).owner_id).toBe(nika.id);
    expect((await question(nika, third.id)).status).toBe('thread');
  });
});

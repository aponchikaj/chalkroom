// Retrieval (B12): the tutors get passages from the room's material and cite them; the class
// transcript and the course syllabus become searchable. Mock tutor: it cites the top passage.
import { afterAll, describe, expect, it } from 'vitest';
import type { SourceRow, SourceUploadRes, StreamEvent } from '@chalk/schema';
import { makePdf } from '../test/fixtures';
import { api, atCheck, closeAll, joinRoom, newUser, sleep, subscribe, waitEvent, type TestUser } from './helpers';

const COURSE = '00000000-0000-4000-8000-000000000001';
const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

async function sourcesUntil(u: TestUser, roomId: string, pred: (s: SourceRow[]) => boolean, ms = 30_000) {
  const t0 = Date.now();
  for (;;) {
    const list = (await api<SourceRow[]>(u, 'GET', `/rooms/${roomId}/sources`)).body;
    if (pred(list)) return list;
    if (Date.now() - t0 > ms) throw new Error(`sources: ${JSON.stringify(list.map((s) => [s.kind, s.status]))}`);
    await sleep(300);
  }
}

describe('retrieval in class', () => {
  it('cites the uploaded material in the Q&A answer, and indexes the transcript', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const created = await api(ana, 'POST', '/rooms', { title: 'Solana PDAs' });
    const room = created.body.room;
    await joinRoom(gio, room.invite_code);
    await Promise.all([subscribe(ana, room.id), subscribe(gio, room.id)]);

    const pdf = makePdf(['Accounts hold data.', 'A PDA has no private key, so only its program can sign for it.', 'invoke_signed passes the seeds.']);
    const up = (await api<SourceUploadRes>(ana, 'POST', `/rooms/${room.id}/sources/upload-url`, { fileName: 'h.pdf', contentType: 'application/pdf', size: pdf.length })).body;
    await ana.sb.storage.from('resources').uploadToSignedUrl(up.path, up.token, pdf, { contentType: 'application/pdf' });
    const src = (await api<SourceRow>(ana, 'POST', `/rooms/${room.id}/sources`, { path: up.path, title: 'Handout' })).body;
    await sourcesUntil(ana, room.id, (l) => l.some((s) => s.id === src.id && s.status === 'ready'));

    await api(ana, 'POST', `/rooms/${room.id}/start`);
    await waitEvent(ana, (e) => e.kind === 'check', 'check');
    await atCheck(ana, 0);
    await api(gio, 'POST', `/rooms/${room.id}/questions`, { text: 'Why can a PDA not sign?' });
    await api(ana, 'POST', `/rooms/${room.id}/questions`, { text: "Why can't a PDA sign transactions?" });
    await api(ana, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
    await api(gio, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
    const qa = (await waitEvent(gio, (e) => e.kind === 'answer_cluster', 'the Q&A answer')) as StreamEvent<'answer_cluster'>;
    const cited = qa.data.steps.map((s) => (s as { add?: { source?: string } }).add?.source).filter(Boolean);
    const list = await sourcesUntil(ana, room.id, (l) => l.some((s) => s.kind === 'transcript' && s.status === 'ready'));
    const transcript = list.find((s) => s.kind === 'transcript')!;
    expect(transcript.title).toMatch(/^Segment 0: /);
    // the top passage is the handout's page 2 or the class's own transcript of segment 0
    expect(cited).toHaveLength(1);
    expect([`res:${src.id}#p2`, `res:${transcript.id}`]).toContain(cited[0]);
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
  });

  it('indexes the course syllabus once when a course class starts', async () => {
    const ana = await user('Ana');
    const room = (await api(ana, 'POST', '/rooms', { title: 'Course class', courseId: COURSE })).body.room;
    await subscribe(ana, room.id);
    await api(ana, 'POST', `/rooms/${room.id}/start`);
    await waitEvent(ana, (e) => e.kind === 'segment_start', 'teaching');
    const list = await sourcesUntil(ana, room.id, (l) => l.some((s) => s.kind === 'syllabus' && s.status === 'ready'));
    expect(list.filter((s) => s.kind === 'syllabus')).toHaveLength(1);
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
  });
});

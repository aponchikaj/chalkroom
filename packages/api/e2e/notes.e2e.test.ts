// Scribe and notes (B3): a summary after each segment, notes at the end, editing with a version
// check, FAQ entries for course rooms, the Q&A answer text kept on the cluster.
import { afterAll, describe, expect, it } from 'vitest';
import type { ClusterRow, NoteBlockRow, StreamEvent } from '@chalk/schema';
import { api, atCheck, closeAll, joinRoom, newUser, subscribe, waitEvent, waitRow, type TestUser } from './helpers';

const COURSE = '00000000-0000-4000-8000-000000000001'; // seed course
const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

/** Run segment 0 to its gate, pass it with grouped questions, then end the class. */
async function shortClass(courseId?: string) {
  const ana = await user('Ana');
  const gio = await user('Gio');
  const created = await api(ana, 'POST', '/rooms', { title: 'Solana PDAs', ...(courseId ? { courseId } : {}) });
  const room = created.body.room;
  await joinRoom(gio, room.invite_code);
  await Promise.all([subscribe(ana, room.id), subscribe(gio, room.id)]);
  await api(ana, 'POST', `/rooms/${room.id}/start`);
  const check = await waitEvent(ana, (e) => e.kind === 'check', 'check');
  await atCheck(ana, 0);
  await api(gio, 'POST', `/rooms/${room.id}/questions`, { text: 'Why can a PDA not sign?' });
  await api(ana, 'POST', `/rooms/${room.id}/questions`, { text: "Why can't a PDA sign transactions?" });
  const checkId = (check.data as { checkId: string }).checkId;
  await api(ana, 'POST', `/rooms/${room.id}/checks/${checkId}/answer`, { answer: 1 });
  await api(gio, 'POST', `/rooms/${room.id}/checks/${checkId}/answer`, { answer: 0 });
  await api(ana, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
  await api(gio, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
  await waitEvent(ana, (e) => e.kind === 'segment_start' && (e.data as { segment: number }).segment === 1, 'segment 1');
  await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
  await waitRow(ana, (r) => r.table === 'note_blocks', 'notes');
  await new Promise((r) => setTimeout(r, 500)); // all blocks broadcast
  return { ana, gio, room };
}

describe('scribe', () => {
  it('summarizes each finished segment on the main stream', async () => {
    const { ana } = await shortClass();
    const s = (await waitEvent(ana, (e) => e.kind === 'segment_summary', 'segment_summary')) as StreamEvent<'segment_summary'>;
    expect(s.data).toMatchObject({ segment: 0, title: expect.any(String) });
    expect(s.data.summary.length).toBeGreaterThan(10);
    expect(s.actor).toBe('scribe');
  });
});

describe('notes', () => {
  it('writes one block per planned segment plus takeaways and class questions', async () => {
    const { ana, room } = await shortClass();
    const blocks = (await ana.sb.from('note_blocks').select('*').eq('room_id', room.id).order('idx')).data as NoteBlockRow[];
    expect(blocks.map((b) => b.idx)).toEqual([0, 1, 2, 3, 4]);
    expect(blocks[0].markdown).toMatch(/^## /);
    expect(blocks[3].markdown).toMatch(/^## Key takeaways/);
    expect(blocks[3].markdown).toContain('Who can sign for a PDA?');
    expect(blocks[4].markdown).toMatch(/^## Questions from class/);
    expect(blocks.every((b) => b.version === 1)).toBe(true);
  });

  it('keeps the spoken Q&A answer on the class cluster', async () => {
    const { ana, room } = await shortClass();
    const c = (await ana.sb.from('clusters').select('*').eq('room_id', room.id).eq('route', 'class')).data as ClusterRow[];
    expect(c[0].answered).toBe(true);
    expect(c[0].answer).toContain('PDA');
  });

  it('edits a block with a version check', async () => {
    const { ana, gio, room } = await shortClass();
    const block = ((await ana.sb.from('note_blocks').select('*').eq('room_id', room.id).eq('idx', 0).single()).data) as NoteBlockRow;
    const ok = await api<NoteBlockRow>(gio, 'PUT', `/rooms/${room.id}/notes/${block.id}`, { markdown: '## What is a PDA?\n\nEdited.', version: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ version: 2, edited_by: gio.id, markdown: '## What is a PDA?\n\nEdited.' });
    const stale = await api(ana, 'PUT', `/rooms/${room.id}/notes/${block.id}`, { markdown: 'late', version: 1 });
    expect(stale.status).toBe(409);
    const eve = await user('Eve');
    expect((await api(eve, 'PUT', `/rooms/${room.id}/notes/${block.id}`, { markdown: 'x', version: 2 })).status).toBe(403);
    expect((await api(ana, 'PUT', `/rooms/${room.id}/notes/${crypto.randomUUID()}`, { markdown: 'x', version: 1 })).status).toBe(404);
    expect((await api(ana, 'PUT', `/rooms/${room.id}/notes/${block.id}`, { markdown: 'x'.repeat(5001), version: 2 })).status).toBe(400);
  });

  it('adds answered class questions to the course FAQ', async () => {
    const { ana } = await shortClass(COURSE);
    const faq = (await ana.sb.from('faq').select('question, answer, askers_total').eq('course_id', COURSE).order('created_at', { ascending: false }).limit(5)).data ?? [];
    expect(faq.some((f) => /PDA/.test(f.question as string) && (f.askers_total as number) >= 1)).toBe(true);
  });
});

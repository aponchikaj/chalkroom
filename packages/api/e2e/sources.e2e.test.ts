// RAG sources (B12): upload, links, ingest to chunks, access, duplicates, deletion.
import { afterAll, describe, expect, it } from 'vitest';
import type { SourceRow, SourceUploadRes } from '@chalk/schema';
import { makePdf } from '../test/fixtures';
import { api, closeAll, createRoom, joinRoom, newUser, sleep, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

const PDF = makePdf(['Accounts hold data and lamports.', 'A PDA has no private key, so only its program can sign.', 'invoke_signed passes the seeds so the runtime can check the PDA.']);

async function upload(u: TestUser, roomId: string, bytes: Uint8Array, contentType: string, fileName: string) {
  const up = await api<SourceUploadRes>(u, 'POST', `/rooms/${roomId}/sources/upload-url`, { fileName, contentType, size: bytes.length });
  expect(up.status).toBe(201);
  const put = await u.sb.storage.from('resources').uploadToSignedUrl(up.body.path, up.body.token, bytes, { contentType });
  expect(put.error).toBeNull();
  return up.body.path;
}

async function ready(u: TestUser, roomId: string, id: string, ms = 30_000): Promise<SourceRow> {
  const t0 = Date.now();
  for (;;) {
    const list = await api<SourceRow[]>(u, 'GET', `/rooms/${roomId}/sources`);
    const s = list.body.find((x) => x.id === id);
    if (s && (s.status === 'ready' || s.status === 'failed')) return s;
    if (Date.now() - t0 > ms) throw new Error(`source ${id} still ${s?.status}`);
    await sleep(300);
  }
}

describe('file sources', () => {
  it('uploads a PDF and ingests it into page-numbered chunks', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    const path = await upload(ana, room.id, PDF, 'application/pdf', 'handout.pdf');
    const add = await api<SourceRow>(ana, 'POST', `/rooms/${room.id}/sources`, { path, title: 'PDA handout' });
    expect(add.status).toBe(201);
    expect(add.body).toMatchObject({ kind: 'file', room_id: room.id, title: 'PDA handout', status: 'pending', mime: 'application/pdf' });
    const s = await ready(ana, room.id, add.body.id);
    expect(s).toMatchObject({ status: 'ready', page_count: 3, error: null });
    expect(s.chunk_count).toBeGreaterThanOrEqual(3);
    const chunks = (await ana.sb.from('chunks').select('page, content').eq('source_id', s.id).order('idx')).data!;
    expect(chunks.find((c) => c.page === 2)?.content).toContain('no private key');
  });

  it('returns the existing source for the same file uploaded again', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    const first = await api<SourceRow>(ana, 'POST', `/rooms/${room.id}/sources`, { path: await upload(ana, room.id, PDF, 'application/pdf', 'a.pdf'), title: 'A' });
    const again = await api<SourceRow>(ana, 'POST', `/rooms/${room.id}/sources`, { path: await upload(ana, room.id, PDF, 'application/pdf', 'b.pdf'), title: 'B' });
    expect(again.body.id).toBe(first.body.id);
  });

  it('ingests Markdown', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    const md = new TextEncoder().encode('# Bumps\n\nfind_program_address starts at 255 and counts down until the address is off the curve.');
    const add = await api<SourceRow>(ana, 'POST', `/rooms/${room.id}/sources`, { path: await upload(ana, room.id, md, 'text/markdown', 'notes.md'), title: 'Notes' });
    expect((await ready(ana, room.id, add.body.id)).status).toBe('ready');
  });

  it('keeps sources to members, and checks the upload path', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const eve = await user('Eve');
    const { room } = await createRoom(ana);
    await joinRoom(gio, room.invite_code);
    const add = await api<SourceRow>(ana, 'POST', `/rooms/${room.id}/sources`, { path: await upload(ana, room.id, PDF, 'application/pdf', 'h.pdf'), title: 'H' });
    await ready(ana, room.id, add.body.id);
    expect((await api(gio, 'GET', `/rooms/${room.id}/sources`)).body).toHaveLength(1);
    expect((await gio.sb.from('chunks').select('id').eq('source_id', add.body.id)).data!.length).toBeGreaterThan(0);
    expect((await api(eve, 'GET', `/rooms/${room.id}/sources`)).status).toBe(403);
    expect((await eve.sb.from('chunks').select('id').eq('source_id', add.body.id)).data).toEqual([]);
    expect((await api(ana, 'POST', `/rooms/${room.id}/sources`, { path: `${crypto.randomUUID()}/x.pdf`, title: 'x' })).status).toBe(400);
    expect((await api(ana, 'POST', `/rooms/${room.id}/sources/upload-url`, { fileName: 'x.png', contentType: 'image/png', size: 10 })).status).toBe(400);
  });

  it('lets the creator or host delete a source, not other members', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const { room } = await createRoom(ana);
    await joinRoom(gio, room.invite_code);
    const add = await api<SourceRow>(ana, 'POST', `/rooms/${room.id}/sources`, { path: await upload(ana, room.id, PDF, 'application/pdf', 'd.pdf'), title: 'D' });
    expect((await api(gio, 'DELETE', `/sources/${add.body.id}`)).status).toBe(403);
    expect((await api(ana, 'DELETE', `/sources/${add.body.id}`)).status).toBe(204);
    expect((await api<SourceRow[]>(ana, 'GET', `/rooms/${room.id}/sources`)).body).toEqual([]);
  });
});

describe('link sources', () => {
  it('refuses private-network and non-web links (400)', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    for (const url of ['http://127.0.0.1:3001/health', 'http://localhost/', 'ftp://example.com/x']) {
      const r = await api(ana, 'POST', `/rooms/${room.id}/sources/url`, { url });
      expect(r.status, url).toBe(400);
    }
  });

  it('fetches a public page and ingests its article', async () => {
    const ana = await user('Ana');
    const { room } = await createRoom(ana);
    const add = await api<SourceRow>(ana, 'POST', `/rooms/${room.id}/sources/url`, { url: 'https://example.com/' });
    expect(add.status).toBe(201);
    const s = await ready(ana, room.id, add.body.id);
    expect(s.status, s.error ?? '').toBe('ready');
    expect(s.title).toBe('Example Domain');
  });
});

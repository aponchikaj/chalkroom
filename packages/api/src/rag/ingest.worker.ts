// The ingest worker: claims pending sources (claim_source(), safe across instances), extracts
// text per page, chunks it, embeds it (when an embedding provider is set), stores the chunks
// and marks the source ready or failed. When the queue is empty it gives vectors to chunks
// stored without one (sources indexed before embeddings were on).
import { createHash } from 'node:crypto';
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { SourceRow } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import { EmbeddingPort } from './embeddings/embedding.port';
import { chunkPages } from './chunk';
import { extract, type Page } from './extract';
import { fetchPage } from './fetch-page';

@Injectable()
export class IngestWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private stopped = false;
  /** the work in progress, awaited on shutdown so a source is not left half-indexed */
  private current: Promise<void> = Promise.resolve();
  /** poll delay: 1 s while there is work, doubling to 15 s while idle; wake() resets it */
  private delay = 1000;
  /** backfill paused until then after the embedder failed */
  private backfillAfter = 0;
  private log = new Logger('Ingest');

  constructor(private supa: SupabaseService, private embeddings: EmbeddingPort) {}

  onApplicationBootstrap() { this.schedule(0); }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.current;
  }

  /** A source was added: look at the queue now instead of after the idle delay. */
  wake() {
    this.delay = 1000;
    if (!this.busy) this.schedule(0);
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.current = this.tick(); }, ms);
  }

  private get db() { return this.supa.db; }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    let worked = false;
    try {
      for (let i = 0; i < 5 && !this.stopped; i++) {
        const r = await this.db.rpc('claim_source');
        const s = (r.data as SourceRow[] | null)?.[0];
        if (!s) { worked = (await this.backfill()) || worked; break; }
        await this.ingest(s);
        worked = true;
      }
    } catch (e) {
      this.log.warn(`queue: ${(e as Error).message}`);
    } finally {
      this.busy = false;
      this.delay = worked ? 1000 : Math.min(this.delay * 2, 15_000);
      this.schedule(this.delay);
    }
  }

  private async pagesOf(s: SourceRow): Promise<{ pages: Page[]; title?: string }> {
    if (s.kind === 'url') {
      const page = await fetchPage(s.uri!);
      const pages = await extract(page.body, page.mime);
      return { pages, title: pages[0]?.heading || undefined };
    }
    const dl = await this.db.storage.from('resources').download(s.uri!);
    if (dl.error || !dl.data) throw new Error('the file is gone from storage');
    return { pages: await extract(Buffer.from(await dl.data.arrayBuffer()), s.mime ?? dl.data.type) };
  }

  /** Up to 32 chunks without a vector get one (partial index chunks_needs_embedding). Updates
   *  are idempotent, so two instances doing this at once only waste a little work. When the
   *  embedder fails it pauses for 5 minutes instead of retrying every tick. Returns whether
   *  it did any work. */
  private async backfill(): Promise<boolean> {
    if (this.embeddings.name === 'none' || Date.now() < this.backfillAfter) return false;
    const r = await this.db.from('chunks').select('id, content').is('embedding', null).limit(32);
    const rows = (r.data ?? []) as { id: number; content: string }[];
    if (!rows.length) return false;
    let vectors: (number[] | null)[];
    try {
      vectors = await this.embeddings.embed(rows.map((c) => c.content), 'document');
    } catch (e) {
      this.backfillAfter = Date.now() + 5 * 60_000;
      this.log.warn(`backfill paused for 5 min: ${(e as Error).message}`);
      return false;
    }
    let done = 0;
    for (let i = 0; i < rows.length; i++) {
      if (!vectors[i]) continue;
      const u = await this.db.from('chunks').update({ embedding: `[${vectors[i]!.join(',')}]` }).eq('id', rows[i].id);
      if (u.error) this.log.warn(`backfill chunk ${rows[i].id}: ${u.error.message}`);
      else done++;
    }
    if (done) this.log.log(`gave vectors to ${done} older chunk(s)`);
    // nothing could be stored: stop hammering the same rows
    if (!done) this.backfillAfter = Date.now() + 5 * 60_000;
    return done > 0;
  }

  /** Chunk, embed and store pages for a source; returns the counts. */
  async store(sourceId: string, pages: Page[]) {
    const drafts = chunkPages(pages);
    if (!drafts.length) throw new Error('no text found');
    // no vectors (the model failed to load, an embedder error): keyword search still works, and
    // backfill() adds the vectors later
    let vectors: (number[] | null)[] = drafts.map(() => null);
    try {
      vectors = await this.embeddings.embed(drafts.map((d) => d.content), 'document');
    } catch (e) {
      this.log.warn(`embedding ${sourceId.slice(0, 8)} failed, stored without vectors: ${(e as Error).message}`);
    }
    // keep the claim fresh: a long ingest must not look abandoned to claim_source()
    await this.db.from('sources').update({ updated_at: new Date().toISOString() }).eq('id', sourceId);
    await this.db.from('chunks').delete().eq('source_id', sourceId);
    for (let i = 0; i < drafts.length; i += 200) {
      const rows = drafts.slice(i, i + 200).map((d, j) => ({
        source_id: sourceId, idx: d.idx, page: d.page, heading: d.heading, content: d.content, token_count: d.tokenCount,
        embedding: vectors[i + j] ? `[${vectors[i + j]!.join(',')}]` : null,
      }));
      const r = await this.db.from('chunks').insert(rows);
      if (r.error) throw new Error(r.error.message);
    }
    const pageNumbers = pages.map((p) => p.page).filter((p): p is number => p !== null);
    return { page_count: pageNumbers.length ? Math.max(...pageNumbers) : null, chunk_count: drafts.length };
  }

  /** Generated material (syllabus, transcript, notes, FAQ): indexed at once, no queue. Never rejects. */
  async indexNow(scope: { room_id?: string; course_id?: string }, kind: 'syllabus' | 'notes' | 'faq' | 'transcript', title: string, pages: Page[]) {
    let id: string | null = null;
    try {
      // sources_dedupe: the same text is indexed once per room or course (a syllabus once per course)
      const checksum = createHash('sha256').update(`${kind}\n${pages.map((p) => p.text).join('\n')}`).digest('hex');
      const ins = await this.db.from('sources').insert({ room_id: scope.room_id ?? null, course_id: scope.course_id ?? null, kind, title: title.slice(0, 200), status: 'processing', checksum }).select('id').single();
      if (ins.error?.code === '23505') return; // already indexed
      if (ins.error) throw new Error(ins.error.message);
      id = ins.data.id as string;
      const counts = await this.store(id, pages);
      await this.db.from('sources').update({ status: 'ready', ...counts }).eq('id', id);
    } catch (e) {
      const message = (e as Error).message.slice(0, 500);
      this.log.warn(`index ${kind}: ${message}`);
      // never leave it `processing`: claim_source() would retry it with no file to read
      if (id) await this.db.from('sources').update({ status: 'failed', error: message }).eq('id', id);
    }
  }

  private async ingest(s: SourceRow) {
    const t0 = Date.now();
    try {
      const { pages, title } = await this.pagesOf(s);
      const counts = await this.store(s.id, pages);
      const rename = s.kind === 'url' && title && s.title === s.uri ? { title: title.slice(0, 200) } : {};
      await this.db.from('sources').update({ status: 'ready', error: null, ...counts, ...rename }).eq('id', s.id);
      this.log.log(`${s.kind} ${s.id.slice(0, 8)}: ${counts.chunk_count} chunks in ${Date.now() - t0} ms`);
    } catch (e) {
      const message = (e as Error).message.slice(0, 500);
      await this.db.from('sources').update({ status: 'failed', error: message }).eq('id', s.id);
      this.log.warn(`${s.kind} ${s.id.slice(0, 8)} failed: ${message}`);
    }
  }
}

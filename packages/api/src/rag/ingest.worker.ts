// The ingest worker: claims pending sources (claim_source(), safe across instances), extracts
// text per page, chunks it, embeds it (when an embedding provider is set), stores the chunks
// and marks the source ready or failed.
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { SourceRow } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import { EmbeddingPort } from './embeddings/embedding.port';
import { chunkPages } from './chunk';
import { extract, type Page } from './extract';
import { fetchPage } from './fetch-page';

@Injectable()
export class IngestWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private log = new Logger('Ingest');

  constructor(private supa: SupabaseService, private embeddings: EmbeddingPort) {}

  onApplicationBootstrap() { this.timer = setInterval(() => void this.tick(), 1000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private get db() { return this.supa.db; }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let i = 0; i < 5; i++) {
        const r = await this.db.rpc('claim_source');
        const s = (r.data as SourceRow[] | null)?.[0];
        if (!s) break;
        await this.ingest(s);
      }
    } catch (e) {
      this.log.warn(`queue: ${(e as Error).message}`);
    } finally {
      this.busy = false;
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

  /** Chunk, embed and store pages for a source; returns the counts. */
  async store(sourceId: string, pages: Page[]) {
    const drafts = chunkPages(pages);
    if (!drafts.length) throw new Error('no text found');
    const vectors = await this.embeddings.embed(drafts.map((d) => d.content), 'document');
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
    try {
      const ins = await this.db.from('sources').insert({ room_id: scope.room_id ?? null, course_id: scope.course_id ?? null, kind, title: title.slice(0, 200), status: 'processing' }).select('id').single();
      if (ins.error) throw new Error(ins.error.message);
      const counts = await this.store(ins.data.id as string, pages);
      await this.db.from('sources').update({ status: 'ready', ...counts }).eq('id', ins.data.id);
    } catch (e) {
      this.log.warn(`index ${kind}: ${(e as Error).message}`);
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

// Retrieval for the tutors: the question's keywords (and its embedding, when a provider is set)
// -> match_chunks() over the room's and its course's ready sources -> passages for the prompt.
import { Injectable, Logger } from '@nestjs/common';
import type { RoomRow } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import { EmbeddingPort } from './embeddings/embedding.port';
import { formatPassages, searchQuery, type Passage } from './retrieval';

@Injectable()
export class RetrieveService {
  private log = new Logger('Retrieve');

  constructor(private supa: SupabaseService, private embeddings: EmbeddingPort) {}

  async passages(room: RoomRow, text: string, k = 6): Promise<Passage[]> {
    const query = searchQuery(text);
    let vector: number[] | null = null;
    try { [vector] = await this.embeddings.embed([text], 'query'); } catch (e) { this.log.warn(`embedding failed, full text only: ${(e as Error).message}`); }
    if (!query && !vector) return [];
    const r = await this.supa.db.rpc('match_chunks', {
      p_query: query, p_embedding: vector ? `[${vector.join(',')}]` : null, p_room: room.id, p_course: room.course_id, p_k: k,
    });
    if (r.error) { this.log.warn(`match_chunks: ${r.error.message}`); return []; }
    return (r.data as { source_id: string; title: string; page: number | null; heading: string; content: string }[])
      .map((c) => ({ sourceId: c.source_id, title: c.title, page: c.page, heading: c.heading, content: c.content }));
  }

  /** Prompt text for a question (empty when nothing matches). */
  async context(room: RoomRow, text: string): Promise<{ text: string; passages: Passage[] }> {
    const passages = await this.passages(room, text);
    return { text: formatPassages(passages), passages };
  }

  /** Ready sources the tutor may cite: id -> page count (null: no pages). */
  async known(room: RoomRow): Promise<Map<string, number | null>> {
    const q = this.supa.db.from('sources').select('id, page_count').eq('status', 'ready');
    const r = await (room.course_id ? q.or(`room_id.eq.${room.id},course_id.eq.${room.course_id}`) : q.eq('room_id', room.id));
    return new Map((r.data ?? []).map((s) => [s.id as string, (s.page_count as number | null) ?? null]));
  }
}

// The only writer of stream events. Data is validated against @chalk/schema before insert;
// append_event() assigns a gap-free seq, and the DB trigger broadcasts the committed row.
import { Injectable } from '@nestjs/common';
import { parseEventData, type StreamEvent, type StreamEventDataOf, type StreamEventKind, type StreamKind } from '@chalk/schema';
import { SupabaseService, must } from './supabase.service';

@Injectable()
export class EventsService {
  /** told about every committed event (the server voice reads narration from it); never awaited */
  private listeners = new Set<(ev: StreamEvent) => void>();
  constructor(private supa: SupabaseService) {}

  onAppend(fn: (ev: StreamEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  async append<K extends StreamEventKind>(streamId: string, kind: K, data: StreamEventDataOf<K>, actor: string): Promise<StreamEvent<K>> {
    const valid = parseEventData(kind, data);
    const r = await this.supa.db.rpc('append_event', { p_stream: streamId, p_kind: kind, p_data: valid, p_actor: actor });
    const ev = must(r, `append ${kind}`) as StreamEvent<K>;
    for (const fn of this.listeners) { try { fn(ev as StreamEvent); } catch { /* a listener never fails an append */ } }
    return ev;
  }

  /** Events after `afterSeq`, in order; all of them unless `limit` is given (pages of 1000, so
   *  a long class never loses its newest events to a row cap). */
  async after(streamId: string, afterSeq = 0, limit = Infinity): Promise<StreamEvent[]> {
    const out: StreamEvent[] = [];
    let seq = afterSeq;
    while (out.length < limit) {
      const page = Math.min(1000, limit - out.length);
      const r = await this.supa.db.from('events').select('*').eq('stream_id', streamId).gt('seq', seq).order('seq').limit(page);
      const rows = must(r, 'list events') as StreamEvent[];
      out.push(...rows);
      if (rows.length < page) break;
      seq = rows[rows.length - 1].seq;
    }
    return out;
  }

  async createStream(roomId: string, kind: StreamKind): Promise<string> {
    const r = await this.supa.db.from('streams').insert({ room_id: roomId, kind }).select('id').single();
    return must(r, 'create stream').id as string;
  }
}

// The only writer of stream events. Data is validated against @chalk/schema before insert;
// append_event() assigns a gap-free seq, and the DB trigger broadcasts the committed row.
import { Injectable } from '@nestjs/common';
import { parseEventData, type StreamEvent, type StreamEventDataOf, type StreamEventKind, type StreamKind } from '@chalk/schema';
import { SupabaseService, must } from './supabase.service';

@Injectable()
export class EventsService {
  constructor(private supa: SupabaseService) {}

  async append<K extends StreamEventKind>(streamId: string, kind: K, data: StreamEventDataOf<K>, actor: string): Promise<StreamEvent<K>> {
    const valid = parseEventData(kind, data);
    const r = await this.supa.db.rpc('append_event', { p_stream: streamId, p_kind: kind, p_data: valid, p_actor: actor });
    return must(r, `append ${kind}`) as StreamEvent<K>;
  }

  async after(streamId: string, afterSeq = 0, limit = 1000): Promise<StreamEvent[]> {
    const r = await this.supa.db.from('events').select('*').eq('stream_id', streamId).gt('seq', afterSeq).order('seq').limit(limit);
    return must(r, 'list events') as StreamEvent[];
  }

  async createStream(roomId: string, kind: StreamKind): Promise<string> {
    const r = await this.supa.db.from('streams').insert({ room_id: roomId, kind }).select('id').single();
    return must(r, 'create stream').id as string;
  }
}

// One RoomConductor per live room. A single API instance runs every room for the hackathon;
// later a Postgres advisory lock per room lets several instances share the load.
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SupabaseService } from '../core/supabase.service';
import { EventsService } from '../core/events.service';
import { RoomsService } from '../rooms/rooms.service';
import { LeadTutorAgent } from '../agents/lead-tutor.agent';
import { TriageService } from '../triage/triage.service';
import { ScribeAgent } from '../agents/scribe.agent';
import { PresenceService } from '../presence/presence.service';
import { UsageMeter } from '../agents/metered.model';
import { RetrieveService } from '../rag/retrieve.service';
import { IngestWorker } from '../rag/ingest.worker';
import { RoomConductor } from './room-conductor';
import { config } from '../config';

@Injectable()
export class ConductorService implements OnApplicationBootstrap {
  private rooms = new Map<string, RoomConductor>();
  private log = new Logger('Conductor');

  constructor(
    private supa: SupabaseService,
    private events: EventsService,
    private roomsService: RoomsService,
    private lead: LeadTutorAgent,
    private triage: TriageService,
    private scribe: ScribeAgent,
    private presence: PresenceService,
    meter: UsageMeter,
    private retrieve: RetrieveService,
    private ingest: IngestWorker,
  ) {
    this.presence.onMembersChanged((id) => void this.for(id).membersChanged());
    meter.onBudgetExceeded((roomId) => void this.roomsService.get(roomId)
      .then((room) => this.events.append(room.main_stream_id, 'notice', { text: 'This class reached its AI budget; the backup tutor takes over.', level: 'warn' }, 'system'))
      .catch(() => undefined));
  }

  for(roomId: string): RoomConductor {
    let c = this.rooms.get(roomId);
    if (!c) {
      c = new RoomConductor(roomId, { supa: this.supa, events: this.events, rooms: this.roomsService, lead: this.lead, triage: this.triage, scribe: this.scribe, retrieve: this.retrieve, ingest: this.ingest });
      this.rooms.set(roomId, c);
    }
    // idempotent; re-watches a room after it emptied out and someone came back
    this.presence.watch(roomId);
    return c;
  }

  async onApplicationBootstrap() {
    if (!config.resumeRooms) return;
    const r = await this.supa.db.from('rooms').select('id').in('phase', ['teaching', 'check', 'qa']);
    if (r.error) { this.log.warn(`could not resume rooms: ${r.error.message}`); return; }
    for (const { id } of r.data ?? []) { void this.for(id).recover(); this.triage.schedule(id); }
    if (r.data?.length) this.log.log(`resuming ${r.data.length} live room(s)`);
  }
}

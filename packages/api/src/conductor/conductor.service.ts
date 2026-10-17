// One RoomConductor per live room. A single API instance runs every room for the hackathon;
// later a Postgres advisory lock per room lets several instances share the load.
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { SupabaseService } from '../core/supabase.service';
import { EventsService } from '../core/events.service';
import { RoomsService } from '../rooms/rooms.service';
import { LeadTutorAgent } from '../agents/lead-tutor.agent';
import { TriageService } from '../triage/triage.service';
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
  ) {}

  for(roomId: string): RoomConductor {
    let c = this.rooms.get(roomId);
    if (!c) {
      c = new RoomConductor(roomId, { supa: this.supa, events: this.events, rooms: this.roomsService, lead: this.lead, triage: this.triage });
      this.rooms.set(roomId, c);
    }
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

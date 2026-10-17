// One RoomConductor per live room this instance drives. Ownership is the room lease
// (room_leases, take_room_lease()): an instance moves a room only while it holds the lease, so
// two instances (a rolling deploy, a dev API beside a test API) never both teach one room. The
// owner heartbeats its leases every 10 s, re-checks its rooms' gates then (a ready vote may have
// reached another instance), picks up orphaned live rooms, and releases its leases on shutdown.
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
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
export class ConductorService implements OnApplicationBootstrap, OnModuleDestroy {
  private rooms = new Map<string, RoomConductor>();
  private log = new Logger('Conductor');
  private heartbeat: ReturnType<typeof setInterval> | null = null;

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

  /** rooms whose lease this instance held at its last check, with when that was */
  private owned = new Map<string, number>();

  for(roomId: string): RoomConductor {
    let c = this.rooms.get(roomId);
    if (!c) {
      c = new RoomConductor(roomId, {
        supa: this.supa, events: this.events, rooms: this.roomsService, lead: this.lead, triage: this.triage, scribe: this.scribe, retrieve: this.retrieve, ingest: this.ingest,
        owns: (id) => this.owns(id),
        ended: (id) => void this.release(id),
      });
      this.rooms.set(roomId, c);
    }
    // idempotent; re-watches a room after it emptied out and someone came back
    this.presence.watch(roomId);
    return c;
  }

  /** Holds (or takes) the room's lease. A positive answer is trusted for 5 s. */
  private async owns(roomId: string): Promise<boolean> {
    const at = this.owned.get(roomId);
    if (at && Date.now() - at < 5_000) return true;
    const r = await this.supa.db.rpc('take_room_lease', { p_room: roomId, p_instance: config.instanceId });
    if (r.error) { this.log.warn(`lease ${roomId.slice(0, 8)}: ${r.error.message}`); return false; }
    if (r.data) this.owned.set(roomId, Date.now());
    else this.owned.delete(roomId);
    return r.data === true;
  }

  /** The class ended: free the conductor and the lease. */
  private async release(roomId: string) {
    this.rooms.delete(roomId);
    this.owned.delete(roomId);
    await this.supa.db.from('room_leases').delete().eq('room_id', roomId).eq('conductor_id', config.instanceId);
  }

  /** Every 10 s: refresh all leases in one call, drop rooms another instance took, and re-check
   *  the gate of owned rooms waiting at one (votes may have reached another instance). */
  private async beat() {
    const ids = [...this.rooms.keys()];
    if (ids.length) {
      const r = await this.supa.db.rpc('take_room_leases', { p_rooms: ids, p_instance: config.instanceId });
      if (r.error) throw new Error(r.error.message);
      const held = new Set((r.data ?? []) as string[]);
      const now = Date.now();
      for (const id of ids) {
        if (held.has(id)) this.owned.set(id, now);
        else { this.owned.delete(id); this.rooms.delete(id); }
      }
      if (held.size) {
        const atGate = await this.supa.db.from('rooms').select('id').in('id', [...held]).eq('phase', 'check');
        for (const row of atGate.data ?? []) void this.rooms.get(row.id as string)?.tick();
      }
    }
    if (config.resumeRooms) await this.resume();
  }

  /** Live rooms nobody drives (their instance died, or never existed): take them over. */
  private async resume() {
    const r = await this.supa.db.rpc('resumable_rooms', { p_instance: config.instanceId });
    if (r.error) { this.log.warn(`could not resume rooms: ${r.error.message}`); return; }
    const ids = ((r.data ?? []) as string[]).filter((id) => !this.rooms.has(id));
    for (const id of ids) { void this.for(id).recover(); this.triage.schedule(id); }
    if (ids.length) this.log.log(`resuming ${ids.length} live room(s)`);
  }

  async onApplicationBootstrap() {
    this.heartbeat = setInterval(() => void this.beat().catch((e: Error) => this.log.warn(`heartbeat: ${e.message}`)), 10_000);
    if (config.resumeRooms) await this.resume();
  }

  /** Shutdown: mark the leases stale, so an instance of the same group takes the rooms over at
   *  once instead of after the 30 s timeout (the row stays: it records the group). */
  async onModuleDestroy() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    const ids = [...this.owned.keys()];
    if (ids.length) await this.supa.db.from('room_leases').update({ seen_at: new Date(0).toISOString() }).in('room_id', ids).eq('conductor_id', config.instanceId);
  }
}

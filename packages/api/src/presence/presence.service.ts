// packages/api/src/presence/presence.service.ts
// The API listens to Supabase Presence on each watched room (service role) and keeps
// room_members.left_at in step with who is really here. The gate already counts left_at.
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { LIVE, roomTopic } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import { RoomsService } from '../rooms/rooms.service';
import { NotFoundException } from '@nestjs/common';
import { PresenceTracker, shouldUnwatch } from './presence-tracker';

interface Watch { channel: RealtimeChannel; tracker: PresenceTracker; timer: ReturnType<typeof setInterval>; subscribed: boolean; busy: boolean }

@Injectable()
export class PresenceService implements OnModuleDestroy {
  private watches = new Map<string, Watch>();
  private listeners: ((roomId: string) => void)[] = [];
  private log = new Logger('Presence');

  constructor(private supa: SupabaseService, private rooms: RoomsService) {}

  /** ConductorService registers here (avoids a constructor cycle). */
  onMembersChanged(fn: (roomId: string) => void) { this.listeners.push(fn); }

  watch(roomId: string) {
    if (this.watches.has(roomId)) return;
    const channel = this.supa.db.channel(roomTopic(roomId), { config: { private: true } });
    const w: Watch = { channel, tracker: new PresenceTracker(LIVE.presenceLeaveMs), timer: setInterval(() => void this.check(roomId), 5_000), subscribed: false, busy: false };
    this.watches.set(roomId, w);
    channel
      .on('presence', { event: 'sync' }, () => void this.check(roomId))
      .subscribe((status, err) => {
        // count absences only once the channel is live, or an empty first state marks everyone gone
        if (status === 'SUBSCRIBED') w.subscribed = true;
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.log.warn(`room ${roomId.slice(0, 8)}: ${status} ${err?.message ?? ''}`);
      });
  }

  async unwatch(roomId: string) {
    const w = this.watches.get(roomId);
    if (!w) return;
    this.watches.delete(roomId);
    clearInterval(w.timer);
    await this.supa.db.removeChannel(w.channel);
  }

  private async check(roomId: string) {
    const w = this.watches.get(roomId);
    if (!w || !w.subscribed || w.busy) return;
    w.busy = true;
    try {
      const room = await this.rooms.get(roomId).catch((e) => { if (e instanceof NotFoundException) return null; throw e; });
      const present = new Set(Object.keys(w.channel.presenceState()));
      const members = room ? (await this.rooms.allMembers(roomId)).map((m) => ({ userId: m.user_id, active: m.left_at === null })) : [];
      if (shouldUnwatch(room?.phase ?? null, members, present)) { await this.unwatch(roomId); return; }
      const { leave, back } = w.tracker.sync(present, members, Date.now());
      if (!leave.length && !back.length) return;
      await this.rooms.setPresence(roomId, back, leave);
      await this.rooms.handOffHost(roomId);
      for (const fn of this.listeners) fn(roomId);
    } catch (e) {
      this.log.warn(`room ${roomId.slice(0, 8)}: ${(e as Error).message}`);
    } finally {
      w.busy = false;
    }
  }

  async onModuleDestroy() {
    for (const id of [...this.watches.keys()]) await this.unwatch(id);
  }
}

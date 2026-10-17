// Sources: what a room's tutors may search. Files upload straight to the private `resources`
// bucket through a signed URL; commit checks the path, removes duplicates by checksum and queues
// the source for the ingest worker. Links are checked by the SSRF guard before they are queued.
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { Api, RoomRow, SourceRow, SourceUploadRes } from '@chalk/schema';
import { SupabaseService } from '../core/supabase.service';
import { RoomsService } from '../rooms/rooms.service';
import { guardUrl } from './fetch-page';
import { IngestWorker } from './ingest.worker';

type Scope = 'room' | 'course';

@Injectable()
export class SourcesService {
  constructor(private supa: SupabaseService, private rooms: RoomsService, private worker: IngestWorker) {}

  private get db() { return this.supa.db; }
  private get bucket() { return this.supa.db.storage.from('resources'); }

  /** Where a new source lives; course scope needs a course room and its host or owner. */
  private async scopeOf(room: RoomRow, userId: string, scope: Scope) {
    if (scope === 'room') return { room_id: room.id, course_id: null };
    if (!room.course_id) throw new BadRequestException('this room has no course');
    const course = await this.db.from('courses').select('owner_id').eq('id', room.course_id).single();
    if (room.host_id !== userId && course.data?.owner_id !== userId) throw new ForbiddenException('only the host or the course owner adds course material');
    return { room_id: null, course_id: room.course_id };
  }

  async list(roomId: string, userId: string): Promise<SourceRow[]> {
    await this.rooms.requireMember(roomId, userId);
    const room = await this.rooms.get(roomId);
    const q = this.db.from('sources').select('*').order('created_at');
    const r = await (room.course_id ? q.or(`room_id.eq.${room.id},course_id.eq.${room.course_id}`) : q.eq('room_id', room.id));
    if (r.error) throw new Error(r.error.message);
    return r.data as SourceRow[];
  }

  async uploadUrl(roomId: string, userId: string, b: z.infer<typeof Api.sourceUploadUrl>): Promise<SourceUploadRes> {
    await this.rooms.requireMember(roomId, userId);
    const safe = b.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
    const path = `${roomId}/${crypto.randomUUID()}-${safe}`;
    const r = await this.bucket.createSignedUploadUrl(path);
    if (r.error) throw new Error(r.error.message);
    return { path, token: r.data.token, signedUrl: r.data.signedUrl };
  }

  async addFile(roomId: string, userId: string, b: z.infer<typeof Api.addSourceFile>): Promise<SourceRow> {
    await this.rooms.requireMember(roomId, userId);
    const room = await this.rooms.get(roomId);
    const [folder, file, ...rest] = b.path.split('/');
    if (folder !== roomId || !file || rest.length) throw new BadRequestException('that upload is not in this room');
    const dl = await this.bucket.download(b.path);
    if (dl.error || !dl.data) throw new BadRequestException('upload not found: upload the file first');
    const checksum = createHash('sha256').update(Buffer.from(await dl.data.arrayBuffer())).digest('hex');
    const scope = await this.scopeOf(room, userId, b.scope);
    const dup = await this.db.from('sources').select('*').eq('checksum', checksum)
      .match(scope.room_id ? { room_id: scope.room_id } : { course_id: scope.course_id! }).maybeSingle();
    if (dup.data) {
      await this.bucket.remove([b.path]);
      // the same file failed before: try it again instead of returning the failure
      if ((dup.data as SourceRow).status !== 'failed') return dup.data as SourceRow;
      const again = await this.db.from('sources').update({ status: 'pending', error: null, attempts: 0 }).eq('id', dup.data.id).select('*').single();
      this.worker.wake();
      return again.data as SourceRow;
    }
    const r = await this.db.from('sources').insert({
      ...scope, kind: 'file', title: b.title, uri: b.path, mime: dl.data.type || null, checksum, created_by: userId,
    }).select('*').single();
    if (r.error) throw new BadRequestException(r.error.message);
    this.worker.wake();
    return r.data as SourceRow;
  }

  async addUrl(roomId: string, userId: string, b: z.infer<typeof Api.addSourceUrl>): Promise<SourceRow> {
    await this.rooms.requireMember(roomId, userId);
    const room = await this.rooms.get(roomId);
    let url: URL;
    try { url = await guardUrl(b.url); } catch (e) { throw new BadRequestException((e as Error).message); }
    const scope = await this.scopeOf(room, userId, b.scope);
    // no title given: the worker replaces the URL with the page title
    const r = await this.db.from('sources').insert({ ...scope, kind: 'url', title: (b.title ?? url.toString()).slice(0, 200), uri: url.toString(), mime: 'text/html', created_by: userId }).select('*').single();
    if (r.error) throw new BadRequestException(r.error.message);
    this.worker.wake();
    return r.data as SourceRow;
  }

  async remove(sourceId: string, userId: string): Promise<void> {
    const r = await this.db.from('sources').select('*').eq('id', sourceId).maybeSingle();
    if (!r.data) throw new NotFoundException('source not found');
    const s = r.data as SourceRow;
    let allowed = s.created_by === userId;
    if (!allowed && s.room_id) allowed = (await this.rooms.get(s.room_id)).host_id === userId;
    if (!allowed && s.course_id) allowed = (await this.db.from('courses').select('owner_id').eq('id', s.course_id).single()).data?.owner_id === userId;
    if (!allowed) throw new ForbiddenException('only who added it, the host or the course owner can delete it');
    if (s.kind === 'file' && s.uri) await this.bucket.remove([s.uri]);
    await this.db.from('sources').delete().eq('id', sourceId);
  }
}

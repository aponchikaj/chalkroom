// packages/api/src/notes/notes.controller.ts
// Shared notes: anyone in the room edits a block; the version check stops lost updates.
import { Body, ConflictException, Controller, NotFoundException, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, type NoteBlockRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { SupabaseService } from '../core/supabase.service';
import { RoomsService } from '../rooms/rooms.service';

@Controller()
@UseGuards(AuthGuard)
export class NotesController {
  constructor(private supa: SupabaseService, private rooms: RoomsService) {}

  @Put('rooms/:id/notes/:blockId')
  async edit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('blockId', ParseUUIDPipe) blockId: string,
    @Body(new ZodPipe(Api.editNote)) body: z.infer<typeof Api.editNote>): Promise<NoteBlockRow> {
    await this.rooms.requireMember(id, u.id);
    const r = await this.supa.db.from('note_blocks')
      .update({ markdown: body.markdown, version: body.version + 1, edited_by: u.id, updated_at: new Date().toISOString() })
      .eq('id', blockId).eq('room_id', id).eq('version', body.version).select('*');
    if (r.error) throw new Error(r.error.message);
    if (r.data?.length) return r.data[0] as NoteBlockRow;
    const exists = await this.supa.db.from('note_blocks').select('id').eq('id', blockId).eq('room_id', id).maybeSingle();
    if (!exists.data) throw new NotFoundException('note block not found');
    throw new ConflictException('someone else edited this block; reload it');
  }
}

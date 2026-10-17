// Class decks: each learner reviews a card on their own FSRS schedule (one card_reviews row each).
import { Body, ConflictException, Controller, ForbiddenException, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Api, FsrsState, type CardReviewRow } from '@chalk/schema';
import { AuthGuard, CurrentUser, type AuthUser } from '../core/auth.guard';
import { ZodPipe } from '../core/zod.pipe';
import { SupabaseService, must } from '../core/supabase.service';
import { RoomsService } from '../rooms/rooms.service';
import { reviewStep } from './fsrs-step';

@Controller()
@UseGuards(AuthGuard)
export class CardsController {
  constructor(private supa: SupabaseService, private rooms: RoomsService) {}

  @Post('cards/:id/review')
  async review(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Api.reviewCard)) body: z.infer<typeof Api.reviewCard>): Promise<CardReviewRow> {
    const db = this.supa.db;
    const found = await db.from('cards').select('room_id, status').eq('id', id).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    if (!found.data) throw new NotFoundException('card not found');
    const card = found.data as { room_id: string | null; status: string };
    const member = card.room_id ? await this.rooms.member(card.room_id, u.id) : null;
    if (!member || member.banned) throw new ForbiddenException('not a member of this room');
    if (card.status !== 'active') throw new ConflictException('this card is not in the deck');
    const prev = await db.from('card_reviews').select('fsrs').eq('card_id', id).eq('user_id', u.id).maybeSingle();
    if (prev.error) throw new Error(prev.error.message);
    const old = prev.data ? FsrsState.safeParse(prev.data.fsrs) : null;
    const fsrs = reviewStep(old?.success ? old.data : null, body.rating);
    return must(await db.from('card_reviews')
      .upsert({ card_id: id, user_id: u.id, fsrs, updated_at: new Date().toISOString() }, { onConflict: 'card_id,user_id' })
      .select('*').single(), 'review card') as CardReviewRow;
  }
}

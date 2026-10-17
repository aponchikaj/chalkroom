// Class deck: the scribe writes cards when the class ends (once), and each learner reviews a
// card on their own FSRS schedule.
import { afterAll, describe, expect, it } from 'vitest';
import type { CardReviewRow, CardRow } from '@chalk/schema';
import { api, atCheck, closeAll, joinRoom, newUser, sleep, subscribe, waitEvent, type TestUser } from './helpers';

const users: TestUser[] = [];
const user = async (name: string) => { const u = await newUser(name); users.push(u); return u; };
afterAll(() => closeAll(users));

async function cardsOf(u: TestUser, roomId: string, min = 1): Promise<CardRow[]> {
  for (let i = 0; i < 60; i++) {
    const rows = ((await u.sb.from('cards').select('*').eq('room_id', roomId)).data ?? []) as CardRow[];
    if (rows.length >= min) return rows;
    await sleep(250);
  }
  throw new Error('no cards after the class ended');
}

describe('class deck', () => {
  it('creates one deck at the end of class and schedules reviews per learner', async () => {
    const ana = await user('Ana');
    const gio = await user('Gio');
    const room = (await api(ana, 'POST', '/rooms', { title: 'Solana PDAs' })).body.room;
    await joinRoom(gio, room.invite_code);
    await Promise.all([subscribe(ana, room.id), subscribe(gio, room.id)]);
    await api(ana, 'POST', `/rooms/${room.id}/start`);
    await atCheck(ana, 0);
    await api(ana, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
    await api(gio, 'POST', `/rooms/${room.id}/ready`, { segment: 0 });
    await waitEvent(ana, (e) => e.kind === 'segment_start' && (e.data as { segment: number }).segment === 1, 'segment 1');
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });

    const cards = await cardsOf(gio, room.id);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.every((c) => c.status === 'active' && c.front && c.back)).toBe(true);

    // ending again does not write a second deck
    await api(ana, 'POST', `/rooms/${room.id}/host`, { action: 'end' });
    await sleep(500);
    expect((await cardsOf(gio, room.id)).length).toBe(cards.length);

    const card = cards[0];
    const r1 = await api<CardReviewRow>(gio, 'POST', `/cards/${card.id}/review`, { rating: 'good' });
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ card_id: card.id, user_id: gio.id });
    expect(r1.body.fsrs.reps).toBe(1);
    expect(new Date(r1.body.fsrs.due).getTime()).toBeGreaterThan(Date.now() - 1000);
    const r2 = await api<CardReviewRow>(gio, 'POST', `/cards/${card.id}/review`, { rating: 'easy' });
    expect(r2.body.fsrs.reps).toBe(2);

    // each learner sees only their own schedule
    const mine = (await gio.sb.from('card_reviews').select('*').eq('card_id', card.id)).data ?? [];
    expect(mine.map((r) => r.user_id)).toEqual([gio.id]);
    expect((await ana.sb.from('card_reviews').select('*').eq('card_id', card.id)).data).toEqual([]);

    const eve = await user('Eve');
    expect((await api(eve, 'POST', `/cards/${card.id}/review`, { rating: 'good' })).status).toBe(403);
    expect((await api(gio, 'POST', `/cards/${crypto.randomUUID()}/review`, { rating: 'good' })).status).toBe(404);
    expect((await api(gio, 'POST', `/cards/${card.id}/review`, { rating: 'perfect' })).status).toBe(400);
  });
});

// FSRS review step: rating -> next schedule, from a fresh card or a stored state.
import { describe, expect, it } from 'vitest';
import { FsrsState } from '@chalk/schema';
import { reviewStep } from '../src/cards/fsrs-step';

const now = new Date('2026-10-17T10:00:00.000Z');

describe('reviewStep', () => {
  it('schedules a new card and matches the stored shape', () => {
    const s = reviewStep(null, 'good', now);
    expect(FsrsState.safeParse(s).success).toBe(true);
    expect(s.reps).toBe(1);
    expect(new Date(s.due).getTime()).toBeGreaterThan(now.getTime());
    expect(s.last_review).toBe(now.toISOString());
  });

  it('moves the due date forward and counts reps on later reviews', () => {
    const first = reviewStep(null, 'good', now);
    const later = new Date(first.due);
    const second = reviewStep(first, 'good', later);
    expect(second.reps).toBe(2);
    expect(new Date(second.due).getTime()).toBeGreaterThan(later.getTime());
  });

  it('spaces easy further than again, and again counts a lapse in review', () => {
    const easy = reviewStep(null, 'easy', now);
    const again = reviewStep(null, 'again', now);
    expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(again.due).getTime());
    expect(easy.state).toBe(2);
    const lapsed = reviewStep(easy, 'again', new Date(easy.due));
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.state).toBe(3);
  });
});

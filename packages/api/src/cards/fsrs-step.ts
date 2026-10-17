// Pure: one FSRS review step with ts-fsrs (stored state + rating -> next state).
import { Rating, createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs';
import type { CardRating, FsrsState } from '@chalk/schema';

const scheduler = fsrs();
const GRADES: Record<CardRating, Grade> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };

const toCard = (s: FsrsState): Card => ({ ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined });

export function reviewStep(prev: FsrsState | null, rating: CardRating, now = new Date()): FsrsState {
  const { card } = scheduler.next(prev ? toCard(prev) : createEmptyCard(now), now, GRADES[rating]);
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    ...(card.last_review ? { last_review: card.last_review.toISOString() } : {}),
  };
}

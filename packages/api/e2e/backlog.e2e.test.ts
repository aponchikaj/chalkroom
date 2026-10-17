// Routes in the contract that are not built yet. Each todo becomes a real test in its task
// (docs/PLANS_DEVB.md).
import { describe, it } from 'vitest';

describe('notes (B3)', () => {
  it.todo('ending a class writes note_blocks');
  it.todo('PUT /rooms/:id/notes/:blockId bumps the version; a stale version returns 409');
});

describe('presence (B5)', () => {
  it.todo('a learner absent from presence for 15 s stops blocking the gate');
  it.todo('the host leaving hands the role to the longest-present member');
});

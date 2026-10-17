// Routes in the contract that are not built yet. Each todo becomes a real test in its task
// (docs/PLANS_DEVB.md). Until then the thread routes answer 501.
import { afterAll, describe, expect, it } from 'vitest';
import { api, closeAll, createRoom, newUser, type TestUser } from './helpers';

const users: TestUser[] = [];
afterAll(() => closeAll(users));

describe('threads (B4)', () => {
  it('answers 501 until B4 is built (replace this test with the todos below)', async () => {
    const host = await newUser('Ana');
    users.push(host);
    const { room } = await createRoom(host);
    expect((await api(host, 'POST', `/rooms/${room.id}/threads`, { topic: 'bump seeds' })).status).toBe(501);
  });

  it.todo('opens a thread with left_main_seq and a tutor greeting');
  it.todo('a message gets a tutor chat reply on the thread stream');
  it.todo('a second open thread returns 409; a stranger gets 403');
  it.todo('the gate passes without the owner of an open thread');
  it.todo('close and share (answered inline cluster)');
});

describe('notes (B3)', () => {
  it.todo('ending a class writes note_blocks');
  it.todo('PUT /rooms/:id/notes/:blockId bumps the version; a stale version returns 409');
});

describe('presence (B5)', () => {
  it.todo('a learner absent from presence for 15 s stops blocking the gate');
  it.todo('the host leaving hands the role to the longest-present member');
});

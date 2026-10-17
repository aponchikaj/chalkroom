// A whole class with the mock tutor: streaming, checks, the ready gate, hold/resume, skip, end.
// Tests in this file run in order and share one room.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamEvent } from '@chalk/schema';
import { api, atCheck, closeAll, createRoom, joinRoom, newUser, sleep, subscribe, waitEvent, waitRow, type TestUser } from './helpers';

describe('a class end to end (mock tutor)', () => {
  let host: TestUser;
  let gio: TestUser;
  let roomId: string;
  let mainStream: string;
  const checkOf = (segment: number) => waitEvent(gio, (e) => e.kind === 'check' && (e.data as { segment: number }).segment === segment, `check ${segment}`);
  const closedOf = (u: TestUser, checkId: string) => waitEvent(u, (e) => e.kind === 'check_closed' && (e.data as { checkId: string }).checkId === checkId, `check_closed ${checkId}`);

  beforeAll(async () => {
    host = await newUser('Ana');
    gio = await newUser('Gio');
    const { room } = await createRoom(host);
    roomId = room.id;
    mainStream = room.main_stream_id;
    await joinRoom(gio, room.invite_code);
    await Promise.all([subscribe(host, roomId), subscribe(gio, roomId)]);
  });
  afterAll(() => closeAll([host, gio]));

  it('starts and streams segment 0 with gap-free seq and a check without its answer', async () => {
    const r = await api(host, 'POST', `/rooms/${roomId}/start`);
    expect(r.status).toBe(202);
    const check = await checkOf(0);
    const main = gio.events.filter((e) => e.stream_id === mainStream);
    expect(main.map((e) => e.seq)).toEqual(main.map((_, i) => i + 1));
    expect(main[0].kind).toBe('segment_start');
    expect(main.some((e) => e.kind === 'board')).toBe(true);
    const q = (check.data as { question: Record<string, unknown> }).question;
    for (const hidden of ['answer', 'accept', 'tolerance', 'rubric', 'explanation']) expect(q).not.toHaveProperty(hidden);
    await atCheck(gio, 0);
  });

  it('grades answers privately and closes the check with the spread when everyone is ready', async () => {
    const check = gio.events.find((e) => e.kind === 'check')!;
    const checkId = (check.data as { checkId: string }).checkId;
    expect((await api(host, 'POST', `/rooms/${roomId}/checks/${checkId}/answer`, { answer: 1 })).status).toBe(204);
    expect((await api(gio, 'POST', `/rooms/${roomId}/checks/${checkId}/answer`, { answer: 0 })).status).toBe(204);

    // own answer only; the broadcast never carries the answer itself
    const mine = await gio.sb.from('check_answers').select('user_id, correct').eq('room_id', roomId);
    expect(mine.data).toEqual([{ user_id: gio.id, correct: false }]);
    await waitRow(host, (r) => r.table === 'check_answers' && r.row.user_id === gio.id, 'gio answer row');
    expect(host.rows.filter((r) => r.table === 'check_answers').every((r) => !('answer' in r.row))).toBe(true);

    await api(host, 'POST', `/rooms/${roomId}/ready`, { segment: 0 });
    expect((await api(gio, 'POST', `/rooms/${roomId}/ready`, { segment: 0 })).status).toBe(204);
    const closed = await closedOf(gio, checkId);
    expect(closed.data).toMatchObject({ spread: { total: 2, correct: 1 }, answer: 1, answerText: expect.any(String) });
  });

  it('rejects late answers (409) and ready votes for a finished segment (409)', async () => {
    const checkId = (gio.events.find((e) => e.kind === 'check')!.data as { checkId: string }).checkId;
    expect((await api(gio, 'POST', `/rooms/${roomId}/checks/${checkId}/answer`, { answer: 1 })).status).toBe(409);
    await waitEvent(gio, (e) => e.kind === 'segment_start' && (e.data as { segment: number }).segment === 1, 'segment 1');
    expect((await api(gio, 'POST', `/rooms/${roomId}/ready`, { segment: 0 })).status).toBe(409);
  });

  it('hold pauses the gate and resume lets it pass', async () => {
    const check = await checkOf(1);
    const checkId = (check.data as { checkId: string }).checkId;
    await atCheck(gio, 1);
    expect((await api(host, 'POST', `/rooms/${roomId}/host`, { action: 'hold' })).status).toBe(202);
    await waitRow(gio, (r) => r.table === 'rooms' && r.row.gate_held === true, 'gate held');
    await api(host, 'POST', `/rooms/${roomId}/ready`, { segment: 1 });
    await api(gio, 'POST', `/rooms/${roomId}/ready`, { segment: 1 });
    await sleep(1500);
    expect(gio.events.some((e: StreamEvent) => e.kind === 'check_closed' && (e.data as { checkId: string }).checkId === checkId)).toBe(false);
    await api(host, 'POST', `/rooms/${roomId}/host`, { action: 'resume' });
    await closedOf(gio, checkId);
  });

  it('accepts slower, and skip on the last check ends the class', async () => {
    expect((await api(host, 'POST', `/rooms/${roomId}/host`, { action: 'slower' })).status).toBe(202);
    await checkOf(2);
    await atCheck(gio, 2);
    expect((await api(host, 'POST', `/rooms/${roomId}/host`, { action: 'skip' })).status).toBe(202);
    await waitEvent(gio, (e) => e.kind === 'notice' && /ended/i.test((e.data as { text: string }).text), 'class ended notice');
    await waitRow(gio, (r) => r.table === 'rooms' && r.row.phase === 'ended' && !!r.row.ended_at, 'phase ended');
  });
});

describe('ending from the lobby', () => {
  it('ends a class that never started', async () => {
    const host = await newUser('Ana');
    const { room } = await createRoom(host);
    await subscribe(host, room.id);
    expect((await api(host, 'POST', `/rooms/${room.id}/host`, { action: 'end' })).status).toBe(202);
    await waitRow(host, (r) => r.table === 'rooms' && r.row.phase === 'ended', 'phase ended');
    await closeAll([host]);
  });
});

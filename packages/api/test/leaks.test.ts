// Long-running state is bounded: conductors of rooms that are not live are let go when idle,
// triage lanes go away after their run, and shutdown stops the work in progress.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
});
const { releasable } = await import('../src/conductor/release');
const { RoomConductor } = await import('../src/conductor/room-conductor');
const { TriageService } = await import('../src/triage/triage.service');

describe('releasable rooms', () => {
  it('lets go of idle conductors whose room is in the lobby, ended or gone; keeps live and busy ones', () => {
    const phases = new Map([['lobby', 'lobby'], ['ended', 'ended'], ['live', 'teaching'], ['gate', 'check'], ['busy', 'lobby']]);
    const idle = (id: string) => id !== 'busy';
    expect(releasable(['lobby', 'ended', 'live', 'gate', 'busy', 'gone'], phases, idle).sort()).toEqual(['ended', 'gone', 'lobby']);
  });
});

describe('RoomConductor', () => {
  it('is idle when nothing is queued, busy while a job runs', async () => {
    let release!: () => void;
    const owns = vi.fn(() => new Promise<boolean>((r) => { release = () => r(false); }));
    const c = new RoomConductor('r', { owns } as never);
    expect(c.idle).toBe(true);
    const job = c.tick();
    expect(c.idle).toBe(false);
    await vi.waitFor(() => expect(owns).toHaveBeenCalled());
    release();
    await job;
    // idle once the job and its error handling are over
    await vi.waitFor(() => expect(c.idle).toBe(true));
  });

  it('runs nothing after shutdown', async () => {
    const owns = vi.fn(async () => true);
    const c = new RoomConductor('r', { owns } as never);
    c.shutdown();
    await c.start();
    expect(owns).not.toHaveBeenCalled();
  });
});

describe('TriageService lanes', () => {
  const noPending = { db: { from: () => { const b: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'order']) b[k] = () => b; b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok); return b; } } };

  it('drops a room\'s lane once its run is over', async () => {
    const t = new TriageService(noPending as never, {} as never, {} as never, {} as never, {} as never);
    await t.runNow('room-1');
    await t.runNow('room-2');
    expect((t as unknown as { lanes: Map<string, unknown> }).lanes.size).toBe(0);
  });

  it('clears waiting batches on shutdown', () => {
    vi.useFakeTimers();
    try {
      const t = new TriageService(noPending as never, {} as never, {} as never, {} as never, {} as never);
      const run = vi.spyOn(t, 'runNow');
      t.schedule('room-1');
      t.onModuleDestroy();
      vi.advanceTimersByTime(60_000);
      expect(run).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

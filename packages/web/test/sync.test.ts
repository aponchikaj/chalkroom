import { describe, it, expect } from 'vitest';
import type { StreamEvent } from '@chalk/schema';
import { StreamSync } from '../src/lib/sync';

const ev = (seq: number, stream = 's1'): StreamEvent => ({
  stream_id: stream, room_id: 'r', seq, kind: 'notice', data: { text: `#${seq}`, level: 'info' }, actor: 'system', t: '',
});

function setup(server: StreamEvent[]) {
  const applied: [number, boolean][] = [];
  const fetches: number[] = [];
  const sync = new StreamSync('s1', async (after) => { fetches.push(after); return server.filter((e) => e.seq > after); }, (e, live) => applied.push([e.seq, live]));
  return { sync, applied, fetches };
}

describe('StreamSync', () => {
  it('replays the snapshot instantly, then buffered live events in order without duplicates', async () => {
    const server = [ev(1), ev(2), ev(3)];
    const { sync, applied } = setup(server);
    sync.receive(ev(4)); // committed after the snapshot query ran
    sync.receive(ev(3)); // overlaps the snapshot
    await sync.start();
    expect(applied).toEqual([[1, false], [2, false], [3, false], [4, true]]);
    expect(sync.lastSeq).toBe(4);
  });

  it('fetches the missing range when seq jumps, and applies everything once in order', async () => {
    const server = [ev(1)];
    const { sync, applied, fetches } = setup(server);
    await sync.start();
    server.push(ev(2), ev(3), ev(4));
    sync.receive(ev(4)); // 2 and 3 were missed
    await new Promise((r) => setTimeout(r, 0));
    expect(fetches).toEqual([0, 1]);
    expect(applied.map(([s]) => s)).toEqual([1, 2, 3, 4]);
  });

  it('ignores other streams and resyncs after a reconnect', async () => {
    const server = [ev(1)];
    const { sync, applied } = setup(server);
    await sync.start();
    sync.receive(ev(2, 'other'));
    server.push(ev(2), ev(3));
    await sync.resync();
    expect(applied.map(([s]) => s)).toEqual([1, 2, 3]);
  });
});

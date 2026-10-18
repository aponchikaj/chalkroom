// packages/api/src/agents/metered.model.ts
// Wraps the model: logs usage per call, keeps per-room totals and enforces the room budget (B6).
import { Injectable } from '@nestjs/common';
import { ModelPort, type ModelEvent, type ModelRequest, type Usage } from './model.port';

/** A room spent its token budget: no more model calls for it. The conductor holds the class. */
export class BudgetExceeded extends Error {
  constructor(readonly roomId: string) {
    super(`room ${roomId.slice(0, 8)} reached its token budget`);
    this.name = 'BudgetExceeded';
  }
}

@Injectable()
export class UsageMeter {
  private rooms = new Map<string, Usage>();

  /** true once a room spent its budget */
  overBudget(roomId: string, budget: number): boolean {
    return this.total(roomId) >= budget;
  }
  add(roomId: string, u: Usage) {
    const t = this.rooms.get(roomId) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    this.rooms.set(roomId, { input: t.input + u.input, output: t.output + u.output, cacheRead: t.cacheRead + u.cacheRead, cacheWrite: t.cacheWrite + u.cacheWrite });
  }
  /** input + output tokens spent by a room (cache reads count as input) */
  total(roomId: string): number {
    const t = this.rooms.get(roomId);
    return t ? t.input + t.cacheRead + t.cacheWrite + t.output : 0;
  }
}

export class MeteredModel extends ModelPort {
  readonly name: string;
  constructor(private inner: ModelPort, private meter: UsageMeter, private log: (m: string) => void,
    /** B6: over this many tokens a room's calls throw BudgetExceeded */
    private budget?: { tokens: number }) {
    super();
    this.name = inner.name;
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const started = Date.now();
    if (this.budget && req.roomId && this.meter.overBudget(req.roomId, this.budget.tokens)) throw new BudgetExceeded(req.roomId);
    for await (const e of this.inner.stream(req)) {
      if (e.type === 'done' && e.usage) {
        if (req.roomId) this.meter.add(req.roomId, e.usage);
        const u = e.usage;
        this.log(`${req.agent} ${req.tool.name} room=${req.roomId?.slice(0, 8) ?? '-'} in=${u.input} out=${u.output} cacheRead=${u.cacheRead} cacheWrite=${u.cacheWrite} ${Date.now() - started}ms`);
      }
      yield e;
    }
  }
}

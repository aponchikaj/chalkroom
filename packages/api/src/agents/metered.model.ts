// packages/api/src/agents/metered.model.ts
// Wraps the model: logs usage per call and keeps per-room totals (B6 adds the budget).
import { Injectable } from '@nestjs/common';
import { ModelPort, type ModelEvent, type ModelRequest, type Usage } from './model.port';

@Injectable()
export class UsageMeter {
  private rooms = new Map<string, Usage>();
  private exceeded = new Set<string>();
  private listeners: ((roomId: string) => void)[] = [];

  onBudgetExceeded(fn: (roomId: string) => void) { this.listeners.push(fn); }

  /** true once a room spent its budget; the first time also notifies the listeners */
  overBudget(roomId: string, budget: number): boolean {
    if (this.total(roomId) < budget) return false;
    if (!this.exceeded.has(roomId)) { this.exceeded.add(roomId); for (const fn of this.listeners) fn(roomId); }
    return true;
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
    /** B6: over this many tokens a room answers from `fallback` (the mock) */
    private budget?: { tokens: number; fallback: ModelPort }) {
    super();
    this.name = inner.name;
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    const started = Date.now();
    const source = this.budget && req.roomId && this.meter.overBudget(req.roomId, this.budget.tokens) ? this.budget.fallback : this.inner;
    for await (const e of source.stream(req)) {
      if (e.type === 'done' && e.usage) {
        if (req.roomId) this.meter.add(req.roomId, e.usage);
        const u = e.usage;
        this.log(`${req.agent} ${req.tool.name} room=${req.roomId?.slice(0, 8) ?? '-'} in=${u.input} out=${u.output} cacheRead=${u.cacheRead} cacheWrite=${u.cacheWrite} ${Date.now() - started}ms`);
      }
      yield e;
    }
  }
}

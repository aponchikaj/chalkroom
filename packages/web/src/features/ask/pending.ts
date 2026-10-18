// Questions this device has sent but the API has not confirmed yet. The ask bar adds one on
// submit and drops it when the row comes back (or the call fails); the rail shows each as a
// pending sticky so a question never disappears between Enter and the answer.
import { create } from 'zustand';

export interface PendingAsk { id: string; text: string; shapes: number; at: number }

interface PendingStore { asks: PendingAsk[] }

export const usePendingAsks = create<PendingStore>(() => ({ asks: [] }));

let n = 0;
export function addPendingAsk(text: string, shapes: number): string {
  const id = `pending-${Date.now()}-${n++}`;
  usePendingAsks.setState((s) => ({ asks: [...s.asks, { id, text, shapes, at: Date.now() }] }));
  return id;
}

export function dropPendingAsk(id: string) {
  usePendingAsks.setState((s) => ({ asks: s.asks.filter((a) => a.id !== id) }));
}

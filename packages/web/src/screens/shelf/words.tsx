// W2: small wording helpers for the class shelf: dates and "due in" phrases, numbers in mono.
import type { ReactNode } from 'react';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "17 Oct 2026" */
export const dayWords = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const n = (v: number, unit: string) => <><span className="mono">{v}</span> {unit}{v === 1 ? '' : 's'}</>;

/** When a card comes due, said the way a person would: "now", "in 10 minutes", "on 21 Oct". */
export function dueWords(iso: string, now = Date.now()): ReactNode {
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms) || ms <= 0) return 'now';
  if (ms < HOUR) return <>in {n(Math.max(1, Math.round(ms / MIN)), 'minute')}</>;
  if (ms < DAY) return <>in {n(Math.round(ms / HOUR), 'hour')}</>;
  if (ms < 14 * DAY) return <>in {n(Math.round(ms / DAY), 'day')}</>;
  return <>on {new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</>;
}

/** "3 cards", with the number in mono. */
export const count = (v: number, unit: string, plural = `${unit}s`) => <><span className="mono">{v}</span> {v === 1 ? unit : plural}</>;

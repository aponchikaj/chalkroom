// A status stamp: the printed label a question, check or thread carries. Words first; colour
// only reinforces. `tone` maps to the manual's inks.
import type { ReactNode } from 'react';

export type StampTone = 'pending' | 'section' | 'ink' | 'ok' | 'action' | 'errata' | 'muted';

export function Stamp({ tone = 'ink', children, icon }: { tone?: StampTone; children: ReactNode; icon?: ReactNode }) {
  return <span className={`stamp stamp-${tone}`}>{icon}{children}</span>;
}

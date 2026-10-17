// A4 (Dev A): the answer spread. One bar per answer, the correct one marked in words and green,
// "you" on this device's choice. Numbers in mono; bars in the section hue.
import { Check } from 'lucide-react';
import type { SpreadRow } from './checkData';
import { Markdown } from '../../components/Markdown';
import { Stamp } from '../../ui/Stamp';

export function Spread({ rows, total }: { rows: SpreadRow[]; total: number }) {
  const max = Math.max(1, total);
  return (
    <ol className="spread" aria-label="How the class answered">
      {rows.map((r) => (
        <li key={r.key} className={`spread-row ${r.correct ? 'is-correct' : ''}`}>
          <div className="spread-label">
            <span className="grow"><Markdown text={r.label} /></span>
            {r.mine && <Stamp tone="ink">You</Stamp>}
            {r.correct && <Stamp tone="ok" icon={<Check size={16} strokeWidth={2} aria-hidden />}>Correct</Stamp>}
          </div>
          <div className="spread-track" aria-hidden>
            <span className="spread-bar" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="spread-count mono" aria-label={`${r.count} of ${total}`}>{r.count}</span>
        </li>
      ))}
    </ol>
  );
}

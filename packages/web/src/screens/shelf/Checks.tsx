// W2: the check after each segment, with how the class did, the answer and why.
import type { LessonPlan, StreamEvent } from '@chalk/schema';
import { Markdown } from '../../components/Markdown';
import { FREE_TEXT, myAnswer, spreadRows } from '../../features/check/checkData';
import { Spread } from '../../features/check/Spread';
import { sectionHue, sectionInk } from '../../ui/section';
import { Stamp } from '../../ui/Stamp';
import { count } from './words';
import '../../features/check/check.css';

export function Checks({ events, plan }: { events: StreamEvent[]; plan: LessonPlan | null }) {
  const titles: Record<number, string> = {};
  for (const e of events) if (e.kind === 'segment_start') { const d = (e as StreamEvent<'segment_start'>).data; titles[d.segment] = d.title; }
  const closed: Record<string, StreamEvent<'check_closed'>['data']> = {};
  for (const e of events) if (e.kind === 'check_closed') { const d = (e as StreamEvent<'check_closed'>).data; closed[d.checkId] = d; }
  const checks = events.filter((e) => e.kind === 'check').map((e) => {
    const d = (e as StreamEvent<'check'>).data;
    return { ...d, title: titles[d.segment] ?? plan?.segments[d.segment]?.title ?? `Segment ${d.segment + 1}`, result: closed[d.checkId] };
  });

  return (
    <>
      <div className="shelf-sec-head">
        <h2>Checks</h2>
        {checks.length > 0 && <p className="shelf-sec-sub">{count(checks.length, 'check')}, one after each segment</p>}
      </div>
      {checks.length === 0 ? <p className="shelf-empty">A quick check closes each segment. Results appear here once the first one closes.</p> : (
        <ol className="shelf-checks">
          {checks.map((c) => {
            const r = c.result;
            const free = FREE_TEXT.has(c.question.type);
            const rows = r && !free && r.spread.total > 0 ? spreadRows(c.question, r, myAnswer(c.checkId)) : [];
            return (
              <li key={c.checkId} className="shelf-check" style={{ ['--section' as string]: sectionHue(c.segment) }}>
                <div className="shelf-check-head">
                  <span className="shelf-seg-tab mono" style={{ background: sectionHue(c.segment), color: sectionInk(c.segment) }} aria-label={`Segment ${c.segment + 1}`}>{c.segment + 1}</span>
                  <h3 className="grow">{c.title}</h3>
                  {!r ? <Stamp tone="pending">Still open</Stamp>
                    : r.spread.total === 0 ? <span className="shelf-check-score muted">Nobody answered</span>
                    : free ? <span className="shelf-check-score">{count(r.spread.total, 'person', 'people')} answered</span>
                      : <span className="shelf-check-score"><span className="mono">{r.spread.correct}</span> of <span className="mono">{r.spread.total}</span> got it</span>}
                </div>
                <Markdown className="shelf-check-prompt" text={c.question.prompt} />
                {r && (
                  <div className="shelf-check-body">
                    {rows.length > 0 && <div className="grow"><Spread rows={rows} total={r.spread.total} /></div>}
                    <div className="shelf-check-why">
                      {r.answerText && <><p className="shelf-label">Answer</p><Markdown className="shelf-check-answer" text={r.answerText} /></>}
                      {r.explanation && <><p className="shelf-label">Why</p><Markdown className="shelf-check-expl" text={r.explanation} /></>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

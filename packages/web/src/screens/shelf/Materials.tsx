// W2: the class's materials: its sources (and its course's), and the scribe's summary of each
// segment, which are this class's own material today.
import { ExternalLink } from 'lucide-react';
import type { SourceRow, StreamEvent } from '@chalk/schema';
import { sectionHue, sectionInk } from '../../ui/section';
import { Stamp, type StampTone } from '../../ui/Stamp';
import { count } from './words';

const KIND: Record<SourceRow['kind'], string> = {
  file: 'Document', url: 'Link', syllabus: 'Syllabus', notes: 'Notes', faq: 'Questions and answers', transcript: 'Transcript',
};
const STATUS: Record<SourceRow['status'], { word: string; tone: StampTone }> = {
  pending: { word: 'Processing', tone: 'pending' },
  processing: { word: 'Processing', tone: 'pending' },
  ready: { word: 'Ready', tone: 'ok' },
  failed: { word: 'Failed', tone: 'errata' },
};
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export function Materials({ sources, events }: { sources: SourceRow[]; events: StreamEvent[] }) {
  const summaries = events.filter((e) => e.kind === 'segment_summary').map((e) => (e as StreamEvent<'segment_summary'>).data);
  // the scribe may revise a summary; keep the latest per segment
  const bySeg = [...new Map(summaries.map((s) => [s.segment, s])).values()].sort((a, b) => a.segment - b.segment);

  return (
    <>
      <div className="shelf-sec-head">
        <h2>Materials</h2>
        {sources.length > 0 && <p className="shelf-sec-sub">{count(sources.length, 'source')} for this class</p>}
      </div>

      {sources.length === 0 ? (
        <p className="shelf-empty">Documents and links for this class appear here. Uploading PDFs arrives with document search.</p>
      ) : (
        <ol className="shelf-sources">
          {sources.map((s) => {
            const st = STATUS[s.status];
            const href = s.kind === 'url' ? safeUrl(s.uri) : null;
            return (
              <li key={s.id} className="shelf-source">
                <div className="grow">
                  <p className="shelf-source-title">{s.title}</p>
                  <p className="shelf-source-meta">
                    <span>{KIND[s.kind]}{!s.room_id && s.course_id ? ', from the course' : ''}</span>
                    <Stamp tone={st.tone}>{st.word}</Stamp>
                    {s.page_count != null && s.page_count > 0 && <span>{count(s.page_count, 'page')}</span>}
                    {s.chunk_count > 0 && <span>{count(s.chunk_count, 'passage')} indexed</span>}
                  </p>
                  {s.status === 'failed' && s.error && <p className="error-text">{s.error}</p>}
                </div>
                {href && (
                  <a className="btn small" href={href} target="_blank" rel="noopener noreferrer">
                    Open link<ExternalLink size={14} strokeWidth={2} aria-hidden /><span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <section aria-labelledby="mat-summaries" className="shelf-group">
        <div className="shelf-sub-head"><h3 id="mat-summaries">Segment summaries</h3>{bySeg.length > 0 && <span className="faint mono">{bySeg.length}</span>}</div>
        {bySeg.length === 0 ? <p className="shelf-empty shelf-empty-sm">The scribe sums up each segment when it ends. None yet.</p> : (
          <ol className="shelf-summaries">
            {bySeg.map((s) => (
              <li key={s.segment} className="shelf-summary">
                <span className="shelf-seg-tab mono" style={{ background: sectionHue(s.segment), color: sectionInk(s.segment) }} aria-label={`Segment ${s.segment + 1}`}>{s.segment + 1}</span>
                <div className="grow">
                  <p className="shelf-summary-title">{s.title}</p>
                  <p className="shelf-summary-text">{s.summary}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

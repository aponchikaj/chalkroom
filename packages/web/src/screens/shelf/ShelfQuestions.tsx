// W2: what was asked in this class and what became of it: my questions first, then the
// class's. The answer shows when there is one; +1 counts stay anonymous.
import type { ClusterRow, QuestionRow } from '@chalk/schema';
import { Markdown } from '../../components/Markdown';
import { Stamp, type StampTone } from '../../ui/Stamp';
import { count } from './words';

function fate(q: QuestionRow, c: ClusterRow | undefined): { tone: StampTone; word: string; answer?: string } {
  if (q.status === 'answered') return { tone: 'ok', word: 'Answered', answer: c?.answer ?? undefined };
  if (q.status === 'thread') return { tone: 'ink', word: 'Taken to a thread' };
  if (q.status === 'flagged') return { tone: 'muted', word: 'Set aside' };
  if (c?.answered) return { tone: 'ok', word: 'Answered in class', answer: c.answer ?? undefined };
  return { tone: 'pending', word: 'Not reached' };
}

export function ShelfQuestions({ questions, clusters, me }: { questions: QuestionRow[]; clusters: Record<string, ClusterRow>; me: string }) {
  const mine = questions.filter((q) => q.author_id === me);
  const theirs = questions.filter((q) => q.author_id !== me);
  return (
    <>
      <div className="shelf-sec-head">
        <h2>Questions</h2>
        {questions.length > 0 && <p className="shelf-sec-sub">{count(questions.length, 'question')} asked in this class</p>}
      </div>
      <Group id="q-yours" title="Yours" list={mine} clusters={clusters} empty="You did not ask anything in this class." />
      <Group id="q-class" title="The class" list={theirs} clusters={clusters} empty="Nobody else asked a question in this class." byline />
    </>
  );
}

function Group({ id, title, list, clusters, empty, byline = false }: {
  id: string; title: string; list: QuestionRow[]; clusters: Record<string, ClusterRow>; empty: string; byline?: boolean;
}) {
  return (
    <section aria-labelledby={id} className="shelf-group">
      <div className="shelf-sub-head"><h3 id={id}>{title}</h3>{list.length > 0 && <span className="faint mono">{list.length}</span>}</div>
      {list.length === 0 ? <p className="shelf-empty shelf-empty-sm">{empty}</p> : (
        <ol className="shelf-qs">
          {list.map((q) => {
            const f = fate(q, q.cluster_id ? clusters[q.cluster_id] : undefined);
            return (
              <li key={q.id} className="shelf-q">
                <div className="shelf-q-head">
                  <Stamp tone={f.tone}>{f.word}</Stamp>
                  {q.votes > 0 && <span className="shelf-q-votes">+1 from {count(q.votes, 'person', 'people')}</span>}
                  {byline && <span className="shelf-q-by">{q.author_name}</span>}
                </div>
                <p className="shelf-q-text">{q.text}</p>
                {f.answer && <Markdown className="shelf-q-answer" text={f.answer} />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

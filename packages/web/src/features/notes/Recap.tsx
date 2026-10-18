// A5 (Dev A): the recap over the board when phase === 'ended': check results per part, my
// questions and what became of them, and the shared notes (read and edited in the Notes tab).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { BookOpen, House, Users } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { ClusterRow, QuestionRow, StreamEvent } from '@chalk/schema';
import { useRoom } from '../../room/store';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { navigate } from '../../lib/router';
import { sectionHue } from '../../ui/section';
import { Stamp, type StampTone } from '../../ui/Stamp';
import { FREE_TEXT, myAnswer, spreadRows } from '../check/checkData';
import { classKudos } from '../../screens/library/files';
import './notes.css';

// the class-over booking panel loads only when a class ends (it is off the classroom's first load)
const BookNext = lazy(() => import('../../screens/library/BookNext').then((m) => ({ default: m.BookNext })));

const minutes = (a: string | null, b: string | null) => a && b ? Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60_000)) : null;

/** First heading (or first line) of a note block, as plain text. */
const headingOf = (md: string) => (md.split('\n').find((l) => l.trim()) ?? '').replace(/^#+\s*/, '').replace(/\*\*|__|`|\$/g, '').trim();

function fate(q: QuestionRow, c: ClusterRow | undefined): { tone: StampTone; word: string; detail?: string } {
  switch (q.status) {
    case 'grouped': return c?.answered
      ? { tone: 'ok', word: 'Answered in class', detail: c.answer ?? (c.title !== q.text ? `With "${c.title}"` : undefined) }
      : { tone: 'muted', word: 'Not reached', detail: 'Grouped for the class, but the class ended first.' };
    case 'answered': return { tone: 'ok', word: 'Answered', detail: c?.answer ?? undefined };
    case 'later': return { tone: 'ink', word: 'Covered in the lesson', detail: c?.target_segment != null ? `Part ${c.target_segment + 1}` : undefined };
    case 'thread': return { tone: 'ink', word: 'Taken to a thread', detail: c?.title };
    case 'flagged': return { tone: 'muted', word: 'Set aside' };
    default: return { tone: 'pending', word: 'Not reached', detail: 'The class ended before triage.' };
  }
}

export function Recap() {
  const room = useRoom((s) => s.room)!;
  const me = useRoom((s) => s.me);
  const notes = useRoom((s) => s.notes);
  const questions = useRoom((s) => s.questions);
  const liveClusters = useRoom((s) => s.clusters);
  // the end of class can outrun the last cluster updates on the channel: read them once more
  const [fresh, setFresh] = useState<Record<string, ClusterRow>>({});
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      void supabase.from('clusters').select('*').eq('room_id', room.id).then((r) => {
        if (live && r.data) setFresh(Object.fromEntries((r.data as ClusterRow[]).map((c) => [c.id, c])));
      });
    }, 1500);
    return () => { live = false; clearTimeout(t); };
  }, [room.id]);
  const clusters = useMemo(() => ({ ...liveClusters, ...fresh }), [liveClusters, fresh]);
  const closed = useRoom((s) => s.closedChecks);
  const mainEvents = useRoom((s) => s.mainEvents);
  const learners = useRoom(useShallow((s) => Object.keys(s.members).length));
  const [leaving, setLeaving] = useState(false);

  const checks = useMemo(() => {
    const titles: Record<number, string> = {};
    for (const e of mainEvents) if (e.kind === 'segment_start') { const d = (e as StreamEvent<'segment_start'>).data; titles[d.segment] = d.title; }
    return mainEvents.filter((e) => e.kind === 'check').map((e) => {
      const d = (e as StreamEvent<'check'>).data;
      return { ...d, title: titles[d.segment] ?? room.lesson_plan?.segments[d.segment]?.title ?? `Part ${d.segment + 1}`, result: closed[d.checkId] };
    }).filter((c) => c.result);
  }, [mainEvents, closed, room.lesson_plan]);
  const mine = useMemo(() => Object.values(questions).filter((q) => q.author_id === me).sort((a, b) => a.created_at.localeCompare(b.created_at)), [questions, me]);
  const heads = useMemo(() => Object.values(notes).sort((a, b) => a.idx - b.idx).map((n) => ({ id: n.id, h: headingOf(n.markdown) })), [notes]);
  const mins = minutes(room.started_at, room.ended_at);
  // kudos for this class: my questions answered for everyone that others shared or +1'd
  const kudos = useMemo(() => me ? classKudos(me, Object.values(questions), clusters) : { questionsHelped: 0, peopleHelped: 0 }, [me, questions, clusters]);
  const amHost = !!me && room.host_id === me;

  const leave = () => {
    setLeaving(true);
    api.leave(room.id).catch(() => { /* the class is over either way */ }).finally(() => navigate('/'));
  };

  return (
    <div className="recap">
      <article className="recap-leaf leaf hinge-in" aria-labelledby="recap-title">
        <header className="recap-head">
          <div className="grow">
            <h2 id="recap-title">Class over: {room.title}</h2>
            <p className="recap-sub">
              {mins != null && <><span className="mono">{mins}</span> min, </>}
              <span className="mono">{checks.length}</span> check{checks.length === 1 ? '' : 's'}, <span className="mono">{learners}</span> in class
            </p>
          </div>
          <div className="row">
            {/* the class page keeps this class's notes, deck, questions and results */}
            <button type="button" className="btn primary" onClick={() => navigate(`/c/${room.id}`)}>
              <BookOpen size={16} strokeWidth={2} aria-hidden />Open class page
            </button>
            <button type="button" className="btn" onClick={leave} disabled={leaving}>
              <House size={16} strokeWidth={2} aria-hidden />{leaving ? 'Leaving' : 'Back home'}
            </button>
          </div>
        </header>

        {kudos.peopleHelped > 0 && (
          <p className="recap-kudos" role="status">
            <Users size={16} strokeWidth={2} aria-hidden />
            <span>Your questions helped <span className="mono">{kudos.peopleHelped}</span> {kudos.peopleHelped === 1 ? 'person' : 'people'}
              {kudos.questionsHelped > 1 && <> across <span className="mono">{kudos.questionsHelped}</span> questions</>}.</span>
          </p>
        )}

        <div className="recap-grid">
          <section className="recap-sec" aria-labelledby="recap-checks">
            <h3 id="recap-checks">Checks</h3>
            {checks.length ? (
              <ol className="recap-list">
                {checks.map((c) => {
                  const r = c.result!;
                  const free = FREE_TEXT.has(c.question.type);
                  const pick = spreadRows(c.question, r, myAnswer(c.checkId)).find((x) => x.mine);
                  return (
                    <li key={c.checkId} style={{ ['--seg' as string]: sectionHue(c.segment) }}>
                      <span className="recap-meta"><span className="recap-seg" aria-hidden /><span className="recap-check-title">{c.title}</span></span>
                      <span className="recap-meta">
                        {r.spread.total === 0 ? <span>Nobody answered</span>
                          : free ? <span><span className="mono">{r.spread.total}</span> answered</span>
                          : <span><span className="mono">{r.spread.correct}</span> of <span className="mono">{r.spread.total}</span> got it</span>}
                        {pick && (pick.correct ? <Stamp tone="ok">You got it</Stamp> : <Stamp tone="ink">You picked another</Stamp>)}
                      </span>
                      {r.answerText && <span className="recap-a">Answer: {r.answerText}</span>}
                    </li>
                  );
                })}
              </ol>
            ) : <p className="recap-empty">No checks closed in this class.</p>}
          </section>

          <section className="recap-sec" aria-labelledby="recap-questions">
            <h3 id="recap-questions">Your questions</h3>
            {mine.length ? (
              <ol className="recap-list">
                {mine.map((q) => {
                  const f = fate(q, q.cluster_id ? clusters[q.cluster_id] : undefined);
                  return (
                    <li key={q.id}>
                      <span className="recap-q">{q.text}</span>
                      <span className="recap-meta"><Stamp tone={f.tone}>{f.word}</Stamp></span>
                      {f.detail && <span className="recap-a">{f.detail}</span>}
                    </li>
                  );
                })}
              </ol>
            ) : <p className="recap-empty">You did not ask anything this time.</p>}
          </section>

          <section className="recap-sec" aria-labelledby="recap-notes">
            <h3 id="recap-notes">Shared notes</h3>
            {heads.length ? (
              <>
                <ol className="recap-list">
                  {heads.map((n) => <li key={n.id}><span className="recap-note-h">{n.h}</span></li>)}
                </ol>
                <p className="recap-empty" style={{ marginTop: 10 }}>Read and edit them in the Notes tab.</p>
              </>
            ) : <p className="recap-empty">The scribe did not write notes for this class.</p>}
          </section>
        </div>

        {amHost && (
          <footer className="recap-foot recap-book">
            <Suspense fallback={null}><BookNext room={room} variant="recap" /></Suspense>
          </footer>
        )}
      </article>
    </div>
  );
}

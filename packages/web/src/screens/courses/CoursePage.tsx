// Lane C: one community course: syllabus as a checklist of topics, FAQ from past classes,
// ratings, start a class on one topic, fork it, and (owner) edit it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Circle, CircleDot, GitFork, Pencil, RotateCw, TriangleAlert } from 'lucide-react';
import { parseSyllabus, type CourseCard, type FaqRow, type SyllabusTopic } from '@chalk/schema';
import { api } from '../../lib/api';
import { navigate } from '../../lib/router';
import { useAuth } from '../../lib/auth';
import { Stamp } from '../../ui/Stamp';
import { describe } from '../entry';
import { RatingText, RoomOptions, Seg, StarInput, openRoom, startsAtIso, type Visibility } from './shared';
import '../../ui/ui.css';
import '../entry.css';
import '../home/home.css';
import './courses.css';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; text: string } | { state: 'ready'; course: CourseCard; faq: FaqRow[] };
const ICON = { size: 16, strokeWidth: 2 } as const;
const goCourses = () => navigate('/#courses');
const VIS = [{ value: 'public', label: 'Public' }, { value: 'private', label: 'Private' }] as const;

const STATUS_ICON: Record<SyllabusTopic['status'], typeof Circle> = { todo: Circle, progress: CircleDot, done: Check, review: CircleDot };

function Head() {
  return (
    <header className="manual-head">
      <button type="button" className="btn ghost small manual-back" onClick={goCourses}><ArrowLeft {...ICON} aria-hidden />All courses</button>
      <span className="manual-brand course-brand">Chalkroom Live</span>
    </header>
  );
}

export function CoursePage({ courseId }: { courseId: string }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const fetchIt = useCallback(() => {
    let alive = true;
    setLoad({ state: 'loading' });
    Promise.all([api.course(courseId), api.courseFaq(courseId)])
      .then(([course, faq]) => { if (alive) setLoad({ state: 'ready', course, faq }); })
      .catch((e: unknown) => {
        if (!alive) return;
        if ((e as { status?: number }).status === 404) setLoad({ state: 'missing' });
        else setLoad({ state: 'error', text: describe(e, 'open').text });
      });
    return () => { alive = false; };
  }, [courseId]);
  useEffect(() => fetchIt(), [fetchIt]);
  useEffect(() => { document.title = load.state === 'ready' ? `${load.course.title} · Chalkroom Live` : 'Chalkroom Live'; }, [load]);

  return (
    <main className="entry">
      <article className="manual leaf punched course-manual">
        <Head />
        {load.state === 'loading' && (
          <div className="manual-body course-body" aria-busy="true">
            <p className="sr-only" role="status">Opening the course</p>
            <div><i className="sk sk-title course-sk" /><i className="sk sk-meta" /><i className="sk sk-meta" /></div>
          </div>
        )}
        {load.state === 'missing' && (
          <div className="manual-body course-problem">
            <h1 className="course-title">Course not found</h1>
            <p className="lede">This course does not exist, or its owner keeps it private.</p>
            <div><button type="button" className="btn primary" onClick={goCourses}><ArrowLeft {...ICON} aria-hidden />All courses</button></div>
          </div>
        )}
        {load.state === 'error' && (
          <div className="manual-body course-problem">
            <div className="errata" role="alert"><TriangleAlert {...ICON} aria-hidden /><span className="grow">{load.text}</span>
              <button type="button" className="btn small" onClick={fetchIt}><RotateCw size={14} strokeWidth={2} aria-hidden /> Try again</button></div>
          </div>
        )}
        {load.state === 'ready' && (
          <Course course={load.course} faq={load.faq} onChange={(course) => setLoad({ ...load, course })} />
        )}
      </article>
    </main>
  );
}

function Course({ course, faq, onChange }: { course: CourseCard; faq: FaqRow[]; onChange: (c: CourseCard) => void }) {
  const me = useAuth((s) => s.me?.profile.id);
  const mine = !!me && course.owner_id === me;
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(false);
  const [forking, setForking] = useState(false);
  const [error, setError] = useState('');
  const syllabus = useMemo(() => parseSyllabus(course.syllabus_md), [course.syllabus_md]);

  const rate = async (stars: number) => {
    setRating(true); setError('');
    const before = course;
    // optimistic: my stars count at once, the mean follows
    const total = (course.rating ?? 0) * course.ratings - (course.my_rating ?? 0) + stars;
    const count = course.ratings + (course.my_rating ? 0 : 1);
    onChange({ ...course, my_rating: stars, ratings: count, rating: Math.round((total / count) * 10) / 10 });
    try { await api.rateCourse(course.id, { stars }); } catch (e) { onChange(before); setError(describe(e, 'open').text); } finally { setRating(false); }
  };

  const fork = async () => {
    setForking(true); setError('');
    try {
      const c = await api.forkCourse(course.id, {});
      navigate(`/courses/${c.id}`);
    } catch (e) { setError(describe(e, 'create').text); setForking(false); }
  };

  return (
    <div className="manual-body course-body">
      <section className="course-main course-head" aria-labelledby={editing ? 'edit-title' : 'course-title'}>
        {editing ? (
          <EditCourse course={course} onDone={(c) => { if (c) onChange({ ...course, ...c }); setEditing(false); }} />
        ) : (
          <>
            <h1 id="course-title" className="course-title">{course.title}</h1>
            {course.goal && <p className="lede course-goal-lede">{course.goal}</p>}
            <dl className="course-facts">
              <div><dt>By</dt><dd>{mine ? 'You' : course.owner_name ?? 'Unknown'}</dd></div>
              <div><dt>Classes run</dt><dd className="mono">{course.rooms_run}</dd></div>
              <div><dt>Rating</dt><dd><RatingText rating={course.rating} ratings={course.ratings} /></dd></div>
              {course.visibility === 'private' && <div><dt>Visibility</dt><dd><Stamp tone="muted">Private</Stamp></dd></div>}
              {course.forked_from && (
                <div><dt>Forked from</dt><dd><a className="text-link" href={`/courses/${course.forked_from}`}
                  onClick={(e) => { e.preventDefault(); navigate(`/courses/${course.forked_from}`); }}>the original course</a></dd></div>
              )}
            </dl>
            <div className="course-actions">
              <div className="rate">
                <span className="field-label">Your rating</span>
                <StarInput value={course.my_rating} onRate={rate} busy={rating} />
              </div>
              <div className="course-buttons">
                <button type="button" className="btn small" onClick={fork} disabled={forking}><GitFork size={14} strokeWidth={2} aria-hidden /> {forking ? 'Forking' : 'Fork'}</button>
                {mine && <button type="button" className="btn small" onClick={() => setEditing(true)}><Pencil size={14} strokeWidth={2} aria-hidden /> Edit</button>}
              </div>
            </div>
            {error && <p className="errata" role="alert">{error}</p>}
          </>
        )}
      </section>

      <StartOnCourse course={course} topics={syllabus.topics} />

      <section className="course-main course-syl" aria-labelledby="syl-title">
        <h2 id="syl-title" className="sub-head">Syllabus</h2>
        {syllabus.topics.length ? (
          <ol className="syllabus">
            {syllabus.topics.map((t) => {
              const Icon = STATUS_ICON[t.status];
              return (
                <li key={`${t.id}-${t.line}`} className={`syl-topic syl-${t.status}`} style={{ ['--depth' as string]: t.depth }}>
                  <Icon size={14} strokeWidth={2.5} aria-hidden />
                  <span>{t.title}</span>
                  {t.status === 'done' && <span className="sr-only">(done)</span>}
                </li>
              );
            })}
          </ol>
        ) : <p className="class-empty">No topics yet.</p>}
      </section>

      <section className="course-main course-faq" aria-labelledby="faq-title">
          <h2 id="faq-title" className="sub-head">Asked in past classes</h2>
          {faq.length ? (
            <ol className="faq">
              {faq.map((f) => (
                <li key={f.id} className="faq-entry">
                  <h3 className="faq-q">{f.question}</h3>
                  <p className="faq-a">{f.answer}</p>
                  <p className="faq-n">Asked <span className="mono">{f.askers_total}</span> {f.askers_total === 1 ? 'time' : 'times'}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="class-empty">No questions yet. Answered class questions land here after each class, and later classes reuse them.</p>
          )}
      </section>
    </div>
  );
}

function StartOnCourse({ course, topics }: { course: CourseCard; topics: SyllabusTopic[] }) {
  const firstOpen = topics.find((t) => t.status !== 'done') ?? topics[0];
  const [topicId, setTopicId] = useState(firstOpen?.id ?? '');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const topic = topics.find((t) => t.id === topicId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic) return;
    setError('');
    let when: string | undefined;
    try { when = startsAtIso(visibility, startsAt); } catch (err) { setError((err as Error).message); return; }
    setBusy(true);
    try { await openRoom({ title: topic.title, courseId: course.id, topicId: topic.id, visibility, startsAt: when }); } catch (err) { setError(describe(err, 'create').text); setBusy(false); }
  };

  return (
    <form className="entry-form course-start" onSubmit={submit} aria-labelledby="start-course-title">
      <h2 id="start-course-title" className="sub-head">Start a class on this course</h2>
      <div className="field">
        <label className="field-label" htmlFor="course-topic">Topic</label>
        <select id="course-topic" className="select input-lg" value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!topics.length}>
          {topics.map((t) => <option key={`${t.id}-${t.line}`} value={t.id}>{'  '.repeat(t.depth)}{t.title}</option>)}
        </select>
      </div>
      <RoomOptions visibility={visibility} setVisibility={setVisibility} startsAt={startsAt} setStartsAt={setStartsAt} />
      {error && <p className="errata" role="alert">{error}</p>}
      <button className="btn primary btn-lg" disabled={busy || !topic}>{busy ? 'Opening the room' : <>Start a class <ArrowRight {...ICON} aria-hidden /></>}</button>
    </form>
  );
}

function EditCourse({ course, onDone }: { course: CourseCard; onDone: (c?: Partial<CourseCard>) => void }) {
  const [title, setTitle] = useState(course.title);
  const [goal, setGoal] = useState(course.goal);
  const [syllabus, setSyllabus] = useState(course.syllabus_md);
  const [visibility, setVisibility] = useState<Visibility>(course.visibility);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const c = await api.updateCourse(course.id, { title: title.trim(), goal: goal.trim(), syllabusMd: syllabus, visibility });
      onDone(c);
    } catch (err) { setError(describe(err, 'create').text); setBusy(false); }
  };

  return (
    <form className="entry-form course-edit" onSubmit={submit} aria-labelledby="edit-title">
      <h1 id="edit-title" className="course-title">Edit course</h1>
      <div className="field">
        <label className="field-label" htmlFor="ec-title">Title</label>
        <input id="ec-title" className="input input-lg" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ec-goal">Goal</label>
        <textarea id="ec-goal" className="textarea" rows={2} value={goal} maxLength={500} onChange={(e) => setGoal(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ec-syl">Syllabus <span className="field-hint">Markdown, one checkbox item per topic</span></label>
        <textarea id="ec-syl" className="textarea syllabus-input" rows={12} value={syllabus} maxLength={20000} onChange={(e) => setSyllabus(e.target.value)} />
      </div>
      <Seg label="Who can see it" value={visibility} options={VIS} onChange={setVisibility} />
      {error && <p className="errata" role="alert">{error}</p>}
      <div className="course-buttons">
        <button className="btn primary" disabled={busy || !title.trim()}>{busy ? 'Saving' : 'Save course'}</button>
        <button type="button" className="btn" onClick={() => onDone()} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

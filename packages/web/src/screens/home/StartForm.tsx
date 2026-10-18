// Lane C: Home, "Start" tab. Learn from a topic (as before), from a course in the catalog (pick
// one of its syllabus topics), or from a goal (a private course is drafted from it, and the class
// starts on its first topic). Public classes can carry a start time and show in the Lobby.
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { parseSyllabus, type CourseCard } from '@chalk/schema';
import { api } from '../../lib/api';
import { describe } from '../entry';
import { RoomOptions, Seg, openRoom, startsAtIso, type Visibility } from '../courses/shared';

type Source = 'topic' | 'course' | 'goal';
const SOURCES = [{ value: 'topic', label: 'A topic' }, { value: 'course', label: 'A course' }, { value: 'goal', label: 'A goal' }] as const;
const ICON = { size: 16, strokeWidth: 2 } as const;

export function StartForm() {
  const [source, setSource] = useState<Source>('topic');
  const [title, setTitle] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [courses, setCourses] = useState<CourseCard[] | null>(null);
  const [courseId, setCourseId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (source !== 'course' || courses) return;
    api.courses().then(setCourses, () => { setCourses([]); setError('Could not load the courses. Check your internet connection.'); });
  }, [source, courses]);

  const course = courses?.find((c) => c.id === courseId);
  const topics = useMemo(() => (course ? parseSyllabus(course.syllabus_md).topics : []), [course]);
  useEffect(() => { setTopicId(topics[0]?.id ?? ''); }, [topics]);
  const topic = topics.find((t) => t.id === topicId);

  const ready = source === 'topic' ? !!title.trim() : source === 'course' ? !!topic : !!goalTitle.trim() && !!goal.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    let when: string | undefined;
    try { when = startsAtIso(visibility, startsAt); } catch (err) { setError((err as Error).message); return; }
    setBusy(true);
    try {
      if (source === 'topic') await openRoom({ title, visibility, startsAt: when });
      else if (source === 'course' && course && topic) await openRoom({ title: topic.title, courseId: course.id, topicId: topic.id, visibility, startsAt: when });
      else if (source === 'goal') {
        const c = await api.createCourse({ title: goalTitle.trim(), goal: goal.trim(), visibility: 'private' });
        const first = parseSyllabus(c.syllabus_md).topics[0];
        await openRoom({ title: first?.title ?? c.title, courseId: c.id, topicId: first?.id, visibility, startsAt: when });
      }
    } catch (err) {
      setError(describe(err, 'create').text);
      setBusy(false);
    }
  };

  return (
    <form className="entry-form home-section" onSubmit={submit} aria-labelledby="start-title">
      <h2 id="start-title">Start a class</h2>
      <Seg label="Learn from" value={source} options={SOURCES} onChange={(v) => { setSource(v); setError(''); }} />

      {source === 'topic' && (
        <div className="field">
          <label className="field-label" htmlFor="topic">What do you want to learn?</label>
          <input id="topic" className="input input-lg" value={title} maxLength={80} placeholder="A topic, e.g. Solana PDAs" onChange={(e) => setTitle(e.target.value)} />
        </div>
      )}

      {source === 'course' && (
        <>
          <div className="field">
            <label className="field-label" htmlFor="start-course">Course</label>
            <select id="start-course" className="select input-lg" value={courseId} disabled={!courses} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">{courses ? (courses.length ? 'Pick a course' : 'No courses yet') : 'Loading courses'}</option>
              {courses?.map((c) => <option key={c.id} value={c.id}>{c.title}{c.owner_name ? `, by ${c.owner_name}` : ''}</option>)}
            </select>
          </div>
          {course && (
            <div className="field">
              <label className="field-label" htmlFor="start-topic">Topic</label>
              <select id="start-topic" className="select" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                {topics.map((t) => <option key={t.id} value={t.id}>{'  '.repeat(t.depth)}{t.title}</option>)}
              </select>
              {!topics.length && <p className="form-note">This course has no topics yet.</p>}
            </div>
          )}
        </>
      )}

      {source === 'goal' && (
        <>
          <div className="field">
            <label className="field-label" htmlFor="goal-title">Course title</label>
            <input id="goal-title" className="input" value={goalTitle} maxLength={120} placeholder="e.g. Statistics for my exam" onChange={(e) => setGoalTitle(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="goal-text">Your goal</label>
            <textarea id="goal-text" className="textarea" rows={3} value={goal} maxLength={500} placeholder="What you want to be able to do at the end" onChange={(e) => setGoal(e.target.value)} />
          </div>
          <p className="form-note">
            The tutor drafts a private course from your goal and the class starts on its first topic.
            Learning from a PDF? Start from a goal, then add the PDF under Materials in the class; the tutor teaches from it.
          </p>
        </>
      )}

      <RoomOptions visibility={visibility} setVisibility={setVisibility} startsAt={startsAt} setStartsAt={setStartsAt} />
      {error && <p className="errata" role="alert">{error}</p>}
      <button className="btn primary btn-lg" disabled={busy || !ready}>
        {busy ? (source === 'goal' ? 'Drafting the course' : 'Opening the room') : <>Start a class <ArrowRight {...ICON} aria-hidden /></>}
      </button>
      <p className="form-note">You become the host. Share the code, then press Start class when everyone is in.</p>
    </form>
  );
}

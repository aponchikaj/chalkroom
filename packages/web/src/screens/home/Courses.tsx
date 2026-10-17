// Lane C: Home, "Courses" tab: the community catalog (search, ruled entries) and the
// "New course" form. A course without a syllabus gets one drafted by the tutor from its goal.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Plus, RotateCw, Search, X } from 'lucide-react';
import type { CourseCard } from '@chalk/schema';
import { api } from '../../lib/api';
import { navigate } from '../../lib/router';
import { useAuth } from '../../lib/auth';
import { Stamp } from '../../ui/Stamp';
import { describe } from '../entry';
import { RatingText, Seg, type Visibility } from '../courses/shared';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; courses: CourseCard[] };
const VIS = [{ value: 'public', label: 'Public' }, { value: 'private', label: 'Private' }] as const;

function NewCourse({ onCancel }: { onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [syllabus, setSyllabus] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const c = await api.createCourse({ title: title.trim(), goal: goal.trim() || undefined, syllabusMd: syllabus.trim() || undefined, visibility });
      navigate(`/courses/${c.id}`);
    } catch (err) {
      setError(describe(err, 'create').text);
      setBusy(false);
    }
  };

  return (
    <form className="entry-form new-course" onSubmit={submit} aria-labelledby="new-course-title">
      <div className="section-head">
        <h3 id="new-course-title" className="sub-head">New course</h3>
        <button type="button" className="btn small ghost" onClick={onCancel}><X size={14} strokeWidth={2} aria-hidden /> Cancel</button>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="nc-title">Title</label>
        <input id="nc-title" ref={first} className="input" value={title} maxLength={120} placeholder="e.g. Linear algebra for engineers" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="nc-goal">Goal</label>
        <textarea id="nc-goal" className="textarea" rows={2} value={goal} maxLength={500} placeholder="What a learner can do at the end" onChange={(e) => setGoal(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="nc-syl">Syllabus <span className="field-hint">optional Markdown</span></label>
        <textarea id="nc-syl" className="textarea syllabus-input" rows={5} value={syllabus} maxLength={20000}
          placeholder={'- [ ] First topic\n- [ ] Second topic'} onChange={(e) => setSyllabus(e.target.value)} />
        <p className="form-note">One topic per line, as a checkbox item. Leave it empty and the tutor drafts one from the title and goal.</p>
      </div>
      <Seg label="Who can see it" value={visibility} options={VIS} onChange={setVisibility} />
      {error && <p className="errata" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy || !title.trim()}>{busy ? (syllabus.trim() ? 'Saving the course' : 'Drafting the syllabus') : 'Create course'}</button>
    </form>
  );
}

export function Courses() {
  const me = useAuth((s) => s.me?.profile.id);
  const [q, setQ] = useState('');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api.courses(q.trim() || undefined).then((courses) => { if (alive) setLoad({ status: 'ready', courses }); }, () => { if (alive) setLoad({ status: 'error' }); });
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q, attempt]);

  const open = (id: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(`/courses/${id}`);
  };

  return (
    <section className="home-section" aria-labelledby="courses-title">
      <div className="section-head">
        <h2 id="courses-title">Courses</h2>
        {!creating && <button type="button" className="btn small" onClick={() => setCreating(true)}><Plus size={14} strokeWidth={2} aria-hidden /> New course</button>}
      </div>
      {creating && <NewCourse onCancel={() => setCreating(false)} />}
      {!creating && (
        <>
          <div className="search">
            <Search size={16} strokeWidth={2} aria-hidden className="search-icon" />
            <label className="sr-only" htmlFor="course-q">Search courses</label>
            <input id="course-q" className="input" type="search" value={q} placeholder="Search courses by title or goal" onChange={(e) => setQ(e.target.value)} />
          </div>
          {load.status === 'loading' && (
            <ol className="class-list" aria-busy="true" aria-label="Loading courses">
              {[0, 1, 2].map((i) => <li key={i} className="class-row class-skeleton" aria-hidden><div className="class-main"><i className="sk sk-title" /><i className="sk sk-meta" /></div></li>)}
            </ol>
          )}
          {load.status === 'error' && (
            <div className="errata class-error" role="alert">
              <AlertTriangle size={16} strokeWidth={2} aria-hidden />
              <span className="grow">Could not load the courses. Check your internet connection.</span>
              <button type="button" className="btn small" onClick={() => setAttempt((n) => n + 1)}><RotateCw size={14} strokeWidth={2} aria-hidden /> Try again</button>
            </div>
          )}
          {load.status === 'ready' && !load.courses.length && (
            <p className="class-empty">
              {q.trim() ? <>No course matches "{q.trim()}". </> : <>No courses yet. </>}
              <button type="button" className="text-link" onClick={() => setCreating(true)}>Write the first one</button>.
            </p>
          )}
          {load.status === 'ready' && load.courses.length > 0 && (
            <ol className="class-list">
              {load.courses.map((c) => (
                <li key={c.id} className="course-row">
                  <a className="course-link" href={`/courses/${c.id}`} onClick={open(c.id)}>
                    <span className="class-title">{c.title}</span>
                    {c.goal && <span className="course-goal">{c.goal}</span>}
                    <span className="class-meta">
                      {c.owner_id === me ? <span className="class-role">Yours</span> : c.owner_name && <span>By {c.owner_name}</span>}
                      {c.visibility === 'private' && <Stamp tone="muted">Private</Stamp>}
                      <span><span className="mono">{c.rooms_run}</span> {c.rooms_run === 1 ? 'class run' : 'classes run'}</span>
                      <RatingText rating={c.rating} ratings={c.ratings} />
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

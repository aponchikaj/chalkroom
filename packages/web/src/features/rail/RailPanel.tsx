// The right-hand column: Questions, Notes and Materials as divider tabs over one leaf.
// Contents belong to their features: QuestionRail (A1), NotesPanel (A5), MaterialsPanel (AM).
// AM: a citation chip pressed anywhere in the classroom opens the Materials tab.
// Tabs follow Home's pattern: roving tabindex, arrow keys, Home and End, aria-controls. Each tab
// carries a count, and new questions from others are announced politely to screen readers.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { QuestionRail } from './QuestionRail';
import { NotesPanel } from '../notes/NotesPanel';
import { MaterialsPanel } from '../materials/MaterialsPanel';
import { primeSources, useMaterials } from '../materials/store';
import { useRoom } from '../../room/store';
import { transition } from '../../ui/motion';
import './rail.css';

type Tab = 'questions' | 'notes' | 'materials';
const TABS: { id: Tab; label: string }[] = [
  { id: 'questions', label: 'Questions' },
  { id: 'notes', label: 'Notes' },
  { id: 'materials', label: 'Materials' },
];

export function RailPanel() {
  const ended = useRoom((s) => s.room?.phase === 'ended');
  const roomId = useRoom((s) => s.room?.id ?? null);
  const [tab, setTab] = useState<Tab>(ended ? 'notes' : 'questions');
  const focusN = useMaterials((s) => s.focus?.n ?? 0);
  const seen = useRef(focusN);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const counts = useRailCounts();
  // questions from others that arrived while another tab was showing (my own never count, and a
  // question that joins an existing group still counts)
  const [unseenQ, setUnseenQ] = useState(0);
  const tabNow = useRef(tab);
  tabNow.current = tab;
  const announcement = useQuestionAnnouncer((n) => { if (tabNow.current !== 'questions') setUnseenQ((u) => u + n); });

  const select = (t: Tab, focus = false) => {
    if (t === 'questions') setUnseenQ(0);
    if (t !== tab) void transition(() => setTab(t));
    if (focus) tabRefs.current[t]?.focus();
  };

  useEffect(() => { if (roomId) primeSources(roomId); }, [roomId]);
  useEffect(() => {
    if (focusN === seen.current) return;
    seen.current = focusN;
    select('materials');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusN]);
  // the class is over: the notes are what is left to read
  const wasEnded = useRef(ended);
  useEffect(() => {
    if (ended && !wasEnded.current) select('notes');
    wasEnded.current = ended;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);

  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = ({ ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: TABS.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(TABS[(next + TABS.length) % TABS.length].id, true);
  };

  const countOf = (t: Tab) => (t === 'questions' ? counts.questions : t === 'notes' ? counts.notes : counts.materials);

  return (
    <aside className="rail" aria-label="Questions, notes and materials">
      <div className="rail-tabs" role="tablist" aria-label="Questions, notes and materials" onKeyDown={onKey}>
        {TABS.map((t) => {
          const n = countOf(t.id);
          const fresh = t.id === 'questions' && unseenQ > 0;
          return (
            <button key={t.id} type="button" role="tab" id={`rail-tab-${t.id}`} aria-controls="rail-panel"
              aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              className="rail-tab" onClick={() => select(t.id)}
              aria-label={`${t.label}, ${n}${fresh ? `, ${unseenQ} new` : ''}`}>
              <span>{t.label}</span>
              {n > 0 && <span className={`rail-count mono${fresh ? ' fresh' : ''}`} aria-hidden>{n}</span>}
            </button>
          );
        })}
      </div>
      <div id="rail-panel" className="rail-body scroll" role="tabpanel" aria-labelledby={`rail-tab-${tab}`} tabIndex={-1}>
        {tab === 'questions' ? <QuestionRail /> : tab === 'notes' ? <NotesPanel /> : roomId ? <RailMaterials roomId={roomId} /> : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </aside>
  );
}

/** Counts for the tab badges: question cards anyone can see, note blocks, known materials. */
function useRailCounts() {
  const me = useRoom((s) => s.me);
  const questions = useRoom(useShallow((s) => Object.values(s.questions).map((q) => (q.status === 'flagged' && q.author_id !== me ? '' : q.cluster_id ?? q.id))));
  const notes = useRoom((s) => Object.keys(s.notes).length);
  const materials = useMaterials((s) => Object.keys(s.titles).length);
  const cards = useMemo(() => new Set(questions.filter(Boolean)).size, [questions]);
  return { questions: cards, notes, materials };
}

/** "New question from Gio: ..." for questions others ask after this view opened; onFresh gets how many. */
function useQuestionAnnouncer(onFresh: (count: number) => void) {
  const me = useRoom((s) => s.me);
  const onFreshRef = useRef(onFresh);
  onFreshRef.current = onFresh;
  const questions = useRoom((s) => s.questions);
  const known = useRef<Set<string> | null>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!known.current) { known.current = new Set(Object.keys(questions)); return; }
    const fresh = Object.values(questions).filter((q) => !known.current!.has(q.id));
    for (const q of fresh) known.current.add(q.id);
    const theirs = fresh.filter((q) => q.author_id !== me && q.status !== 'flagged');
    if (!theirs.length) return;
    onFreshRef.current(theirs.length);
    setText(theirs.length === 1 ? `New question from ${theirs[0].author_name}: ${theirs[0].text}` : `${theirs.length} new questions in the rail`);
  }, [questions, me]);
  return text;
}

function RailMaterials({ roomId }: { roomId: string }) {
  const room = useRoom(useShallow((s) => (s.room ? { host_id: s.room.host_id, course_id: s.room.course_id } : null)));
  const me = useRoom((s) => s.me);
  const members = useRoom(useShallow((s) => Object.values(s.members)));
  return <MaterialsPanel roomId={roomId} room={room} me={me} members={members} compact />;
}

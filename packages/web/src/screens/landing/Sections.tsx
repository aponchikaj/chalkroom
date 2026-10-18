// The landing page's sections after the hero: where a question goes (and a check result),
// threads and catch-up, notes and flashcards after class, and how it is built. Each section
// takes its divider tab's hue as --section.
import { useRef, useState } from 'react';
import { ArrowUpRight, Check, Paperclip, RotateCcw, Undo2 } from 'lucide-react';
import { PDA_SEGMENTS, mockCards } from '@chalk/mock-tutor';
import { Punch } from '../../ui/Punch';
import { Stamp } from '../../ui/Stamp';
import { useSeen } from './hooks';

const hue = (h: string) => ({ ['--section' as string]: `var(${h})` });

/* ---------- Questions: the four routes and a check result ---------- */

const ROUTES = [
  { stamp: <Stamp tone="section">Grouped, 2 asked</Stamp>, q: 'Why can a PDA not sign?', who: 'Gio and Mari, in their own words', a: 'Merged into one card. The tutor answers it on the board in the next Q&A and credits both.' },
  { stamp: <Stamp tone="ink">Coming up next</Stamp>, q: 'What is a bump seed?', who: 'Nika asked', a: 'The lesson plan covers it in the next segment, so it waits for its page.' },
  { stamp: <Stamp tone="ok">Answered</Stamp>, q: 'Is the program id part of the hash?', who: 'You asked', a: 'A short reply right on the question card. The class keeps going.' },
  { stamp: <Stamp tone="ink" icon={<ArrowUpRight aria-hidden />}>Thread offered</Stamp>, q: 'How is the bump actually found?', who: 'Nika, her third question on bumps', a: 'An offer to dig in one to one with a side tutor. Opt in, never forced.' },
];

const CHECK = PDA_SEGMENTS[0].check!;
const SPREAD = [0, 3, 1];

export function QuestionsSection() {
  const slipRef = useRef<HTMLDivElement>(null);
  const seen = useSeen(slipRef, 0.5);
  const options = CHECK.options ?? [];
  const answer = typeof CHECK.answer === 'number' ? CHECK.answer : -1;
  const total = SPREAD.reduce((a, b) => a + b, 0);
  return (
    <section className="ld-sect" id="questions" aria-labelledby="ld-q-title" style={hue('--h-teal')}>
      <div className="ld-sect-copy">
        <h2 id="ld-q-title">Every question goes somewhere.</h2>
        <p className="ld-read">Ask whenever it comes to you. Within a few seconds your question shows where it went, so nothing disappears into a forum and nobody stalls the class.</p>
        <p className="ld-hand ld-hand-tilt" aria-hidden>+1 is anonymous.<br />The quiet one gets the answer too.</p>
      </div>
      <div className="ld-sect-body">
        <ol className="ld-routes">
          {ROUTES.map((r) => (
            <li key={r.q}>
              <span className="ld-route-stamp">{r.stamp}</span>
              <span className="ld-route-q">{r.q}<small>{r.who}</small></span>
              <span className="ld-route-a">{r.a}</span>
            </li>
          ))}
        </ol>

        <div className="ld-check">
          <div className={`ld-slip${seen ? ' seen' : ''}`} ref={slipRef} role="group" aria-label={`Check after segment 1: ${CHECK.prompt} ${SPREAD[answer] ?? 0} of ${total} chose the right answer.`}>
            <span className="ld-hole" aria-hidden /><span className="ld-hole" aria-hidden />
            <Stamp tone="section">Check, segment 1</Stamp>
            <p className="ld-slip-prompt">{CHECK.prompt}</p>
            <ul className="ld-spread">
              {options.map((o, i) => (
                <li key={o} className={i === answer ? 'right' : ''}>
                  <span className="mono ld-key">{String.fromCharCode(65 + i)}</span>
                  <span>{o}</span>
                  <span className="ld-track"><i style={{ ['--w' as string]: `${(SPREAD[i] / total) * 100}%` }} /></span>
                  <span className="mono ld-n">{SPREAD[i]}</span>
                </li>
              ))}
            </ul>
            <span className="ld-rubber" aria-hidden>Correct<small className="mono">3 of 4</small></span>
          </div>
          <div className="ld-gate">
            <ul className="ld-ready">
              <li><Punch name="Ana" color="#f2d16b" ready size="sm" host /> Ana, ready</li>
              <li><Punch name="Gio" color="#a8dc9f" ready size="sm" /> Gio, ready</li>
              <li><Punch name="Mari" color="#f4a6c8" ready size="sm" /> Mari, ready</li>
              <li><Punch name="Nika" color="#8fc7e8" inThread size="sm" /> Nika, in a thread</li>
            </ul>
            <p>The class moves on when everyone is ready, a timer runs out, or the host skips. Someone in a thread never holds it up.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Threads: tracing paper and the catch-up card ---------- */

export function ThreadsSection() {
  return (
    <section className="ld-sect" id="threads" aria-labelledby="ld-t-title" style={hue('--h-grass')}>
      <div className="ld-sect-copy">
        <h2 id="ld-t-title">Go deeper. The class keeps going.</h2>
        <p className="ld-read">Take the offer and a side tutor opens on tracing paper, clipped over the class, with its own small board. The class board stays live underneath, and you never hold up the ready gate.</p>
        <p className="ld-hand ld-hand-tilt" aria-hidden>the others can peek,<br />or join in</p>
      </div>
      <div className="ld-sect-body ld-threads">
        <figure className="ld-tracing" aria-label="A thread: Nika asks how the bump is found, and the side tutor answers on its own small board.">
          <svg className="ld-underboard" viewBox="0 0 660 320" aria-hidden>
            <path d="M40 92 L170 90 L172 160 L38 162 Z M240 98 L356 100 L355 152 L241 150 Z M356 126 L470 126 M456 116 L472 126 L456 136" />
            <circle cx="540" cy="126" r="48" />
            <text x="105" y="133">Wallet</text><text x="298" y="132">Program</text><text x="540" y="134">PDA</text>
            <text x="40" y="228" className="f">PDA = H(seeds, programId, bump)</text>
          </svg>
          <div className="ld-sheet">
            <span className="ld-clip" aria-hidden><Paperclip size={22} strokeWidth={2} /></span>
            <div className="ld-sheet-head">
              <span className="ld-sheet-title">Finding the bump</span>
              <Stamp tone="section">Your thread</Stamp>
            </div>
            <div className="ld-script">
              <p className="ld-line me"><b>Nika</b><span>How is the bump actually found?</span></p>
              <p className="ld-line tutor"><b>Tutor</b><span>It starts at 255 and counts down. The first value that pushes the hash off the curve is the bump.</span></p>
            </div>
            <svg className="ld-miniboard" viewBox="0 0 420 150" aria-hidden>
              <text x="20" y="40">255</text><text x="110" y="40" className="m">on curve</text>
              <text x="20" y="84">254</text><text x="110" y="84" className="m">on curve</text>
              <text x="20" y="128" className="hit">253</text><text x="110" y="128" className="hit">off the curve: found</text>
              <path d="M10 102 Q 190 94 376 106 Q 396 144 190 145 Q 6 148 10 102" />
            </svg>
          </div>
        </figure>

        <figure className="ld-catchup leaf" aria-label="The catch-up card after a thread">
          <span className="ld-catchup-label">While you were away</span>
          <p className="ld-catchup-seg">Part 2: Finding the bump</p>
          <ul>
            <li>find_program_address tries bump 255, then counts down.</li>
            <li>It stops at the first hash that lands off the curve.</li>
            <li>About half the time the very first try works.</li>
          </ul>
          <div className="ld-fake-row" aria-hidden>
            <span className="btn small"><RotateCcw size={13} /> Replay at 2x</span>
            <span className="btn small primary"><Undo2 size={13} /> Back to class</span>
          </div>
        </figure>
      </div>
    </section>
  );
}

/* ---------- After class: shared notes and a flashcard deck ---------- */

const CARDS = mockCards().cards;

function Flashcards() {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = CARDS[i];
  const next = () => { setFlipped(false); setI((i + 1) % CARDS.length); };
  return (
    <div className="ld-deck">
      <div className="ld-deck-stack" aria-hidden><span /><span /></div>
      <button type="button" className={`ld-card${flipped ? ' flipped' : ''}`} onClick={() => setFlipped(!flipped)}
        aria-label={flipped ? `Answer: ${card.back}. Press to see the question.` : `Question: ${card.front}. Press to see the answer.`}>
        <span className="ld-card-face front"><span className="ld-card-q">{card.front}</span><span className="ld-card-hint">Tap to turn over</span></span>
        <span className="ld-card-face back"><span className="ld-card-a">{card.back}</span></span>
      </button>
      <div className="ld-deck-row">
        <span className="mono ld-deck-count" aria-live="polite">{i + 1} / {CARDS.length}</span>
        <button type="button" className="btn small" onClick={() => setFlipped(!flipped)}>{flipped ? 'Show question' : 'Show answer'}</button>
        <button type="button" className="btn small" onClick={next}>Next card</button>
      </div>
    </div>
  );
}

export function AfterSection() {
  return (
    <section className="ld-sect" id="after" aria-labelledby="ld-a-title" style={hue('--h-ultra')}>
      <div className="ld-sect-copy">
        <h2 id="ld-a-title">Notes the whole class can edit.</h2>
        <p className="ld-read">After each part the scribe drafts shared notes. Anyone can edit a block, and you see who is editing which. It also proposes flashcards from what was taught.</p>
        <p className="ld-hand ld-hand-tilt" aria-hidden>your questions and their<br />answers come with you</p>
      </div>
      <div className="ld-sect-body ld-after">
        <div className="ld-notes ruled" aria-label="Shared notes" role="group">
          <p className="ld-notes-h">Part 1: What is a PDA?</p>
          <p><span className="ld-by" style={{ ['--who' as string]: 'var(--ink-3)' }}>Scribe</span>A PDA is an address with <mark>no private key</mark>. Only the program that derived it can sign for it.</p>
          <p><span className="ld-by" style={{ ['--who' as string]: '#d0679a' }}>Mari</span>Same seeds and the same program id give the same address, every time.</p>
          <p className="ld-notes-h">Part 2: Finding the bump</p>
          <p><span className="ld-by" style={{ ['--who' as string]: 'var(--ink-3)' }}>Scribe</span>Start at bump <code className="mono">255</code> and count down.</p>
          <p><span className="ld-by" style={{ ['--who' as string]: '#3d8fc0' }}>Nika</span>Store the bump so you never search again. <span className="chip ld-editing">Gio is editing</span></p>
        </div>
        <Flashcards />
      </div>
    </section>
  );
}

/* ---------- How it is built: four agents, one log ---------- */

const AGENTS = [
  { name: 'Lead tutor', does: 'plans the lesson, draws and narrates it, answers grouped questions' },
  { name: 'Thread tutors', does: 'one per learner who goes deep, each with its own small board' },
  { name: 'Triage', does: 'groups similar questions and picks a route for each' },
  { name: 'Scribe', does: 'segment summaries, catch-up cards and the shared notes' },
];

const LOG = [
  { seq: 141, kind: 'segment_start', by: 'Lead tutor', what: 'Part 1: What is a PDA?' },
  { seq: 142, kind: 'board', by: 'Lead tutor', what: 'draws Wallet, Program and PDA' },
  { seq: 143, kind: 'board', by: 'Lead tutor', what: 'writes PDA = H(seeds, programId, bump)' },
  { seq: 144, kind: 'check', by: 'Lead tutor', what: 'Who can sign for a PDA?' },
  { seq: 145, kind: 'answer_cluster', by: 'Lead tutor', what: 'Why can a PDA not sign? for Gio and Mari' },
  { seq: 146, kind: 'segment_summary', by: 'Scribe', what: 'What is a PDA?, in three lines' },
];

export function BuiltSection() {
  const logRef = useRef<HTMLOListElement>(null);
  const seen = useSeen(logRef, 0.35);
  return (
    <section className="ld-sect" id="built" aria-labelledby="ld-b-title" style={hue('--h-violet')}>
      <div className="ld-sect-copy">
        <h2 id="ld-b-title">Four agents. One log.</h2>
        <p className="ld-read">The agents never draw on your screen directly. Each writes numbered entries to one append-only log on the server, and every seat replays the same entries, so five screens show one board.</p>
        <p className="ld-read">Every agent answers with one validated tool call. With no model key, a scripted mock tutor teaches a whole class, so a demo never depends on a model being up.</p>
      </div>
      <div className="ld-sect-body ld-built">
        <ul className="ld-agents">
          {AGENTS.map((a) => <li key={a.name}><b>{a.name}</b><span>{a.does}</span></li>)}
        </ul>
        <div className="ld-ledger">
          <div className="ld-ledger-head"><span>The class log</span><span className="faint">append only, one writer</span></div>
          <ol ref={logRef} className={seen ? 'seen' : ''}>
            {LOG.map((e, i) => (
              <li key={e.seq} style={{ ['--i' as string]: i }}>
                <span className="mono ld-seq">{String(e.seq).padStart(4, '0')}</span>
                <span className="mono ld-kind">{e.kind}</span>
                <span className="ld-by-agent">{e.by}</span>
                <span className="ld-what">{e.what}</span>
              </li>
            ))}
          </ol>
          <div className="ld-ledger-foot">
            <span className="ld-mini-punches" aria-hidden>
              {['#f2d16b', '#8fc7e8', '#a8dc9f', '#f4a6c8', '#c9b7f0'].map((c) => <i key={c} style={{ ['--who' as string]: c }} />)}
            </span>
            <span><Check size={13} aria-hidden /> Every seat replays the same entries</span>
          </div>
        </div>
      </div>
    </section>
  );
}

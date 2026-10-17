// Scripted tutor for development and demo insurance. The API's MockModel answers every agent
// call from here, so the whole classroom runs with no network and no API key.
import type { BoardStep, LessonPlan, ProposedCards, TeachSegment, TriageResult } from '@chalk/schema';

export const PDA_PLAN: LessonPlan = {
  topic: 'Program Derived Addresses',
  segments: [
    { title: 'What is a PDA?', objective: 'Explain why a PDA has no private key.' },
    { title: 'Finding the bump', objective: 'Describe how find_program_address picks the bump.' },
    { title: 'Signing with invoke_signed', objective: 'Explain how a program signs for its PDA.' },
  ],
};

export const PDA_SEGMENTS: TeachSegment[] = [
  {
    title: 'What is a PDA?',
    steps: [
      { add: { id: 'title', kind: 'text', text: 'Program Derived Addresses', at: [5.5, 0.4], style: 'accent' } },
      { add: { id: 'wallet', kind: 'box', text: 'Wallet\n(has a key)', at: [1.5, 2] } },
      { say: 'Normal accounts are owned by a keypair. Whoever holds the private key can sign.' },
      { add: { id: 'program', kind: 'box', text: 'Program', at: [5.5, 2] } },
      { add: { id: 'pda', kind: 'circle', text: 'PDA', at: [9.5, 2], style: 'accent' } },
      { add: { id: 'e1', kind: 'arrow', from: 'program', to: 'pda', label: 'seeds + bump' } },
      { say: 'A PDA is derived from seeds and the program id. It is not generated from a keypair.' },
      { write: { id: 'f1', latex: '\\text{PDA} = H(\\text{seeds}, \\text{programId}, \\text{bump})', at: [5.5, 4.2] } },
      { highlight: 'pda', for: 2 },
      { say: 'Because the result lies off the curve, no private key exists for it.' },
      { add: { id: 'note', kind: 'sticky', text: 'Only the program can sign for its PDA', at: [9.5, 5.2] } },
    ],
    check: {
      id: 'c1', type: 'mcq', difficulty: 2, prompt: 'Who can sign for a PDA?',
      options: ['Anyone with its private key', 'Only the program that derived it', 'The wallet that paid for it'],
      answer: 1, explanation: 'There is no private key; the program signs with invoke_signed.',
    },
  },
  {
    title: 'Finding the bump',
    steps: [
      { page: { title: 'Finding the bump' } },
      { add: { id: 'code1', kind: 'code', lang: 'rust', code: 'let (pda, bump) = Pubkey::find_program_address(\n    &[b"vault", user.key().as_ref()],\n    program_id,\n);', at: [4, 2] } },
      { say: 'find program address tries bump 255, then 254, and so on, until the hash lands off the curve.' },
      { add: { id: 'tbl', kind: 'table', rows: [['bump', 'on curve?'], ['255', 'yes'], ['254', 'yes'], ['253', 'no (found)']], at: [9.5, 2.2] } },
      { underline: 'tbl' },
      { add: { id: 'ch', kind: 'chart', chart: { type: 'bar', data: [{ x: '1st', y: 50 }, { x: '2nd', y: 25 }, { x: '3rd', y: 12.5 }, { x: '4th+', y: 12.5 }], yLabel: '% found' }, at: [4, 5.6] } },
      { say: 'About half the time the very first try works.' },
    ],
    check: {
      id: 'c2', type: 'numeric', difficulty: 2, prompt: 'Which bump value does find_program_address try first?',
      answer: 255, explanation: 'It starts at 255 and counts down.',
    },
  },
  {
    title: 'Signing with invoke_signed',
    steps: [
      { page: { title: 'Signing with invoke_signed' } },
      { mermaid: { id: 'seq', code: 'sequenceDiagram\n  participant P as Program\n  participant R as Runtime\n  participant T as Token program\n  P->>R: invoke_signed(ix, seeds)\n  R->>R: re-derive PDA from seeds\n  R->>T: ix with PDA as signer', at: [5.5, 3.5], size: [8, 5] } },
      { say: 'The runtime re-derives the address from the seeds. If it matches, the PDA counts as a signer.' },
    ],
    check: {
      id: 'c3', type: 'tf', difficulty: 2, prompt: 'A program stores the private key of its PDA.',
      answer: false, explanation: 'No private key exists; the runtime re-derives the PDA from the seeds.',
    },
  },
];

export function mockPlan(): LessonPlan {
  return PDA_PLAN;
}

/** Segment n of the scripted lesson (wraps around so a long demo never runs dry). */
export function mockTeach(segment: number): TeachSegment {
  return PDA_SEGMENTS[segment % PDA_SEGMENTS.length];
}

/** `source`: a citation (res:<id>#p<page>) from retrieved material, put on the answer box. */
export function mockClusterAnswer(title: string, askers: string[], source?: string): BoardStep[] {
  const who = askers.length > 1 ? `${askers.slice(0, -1).join(', ')} and ${askers[askers.length - 1]}` : askers[0] ?? 'someone';
  return [
    { page: { title: `Q&A: ${title}` } },
    { add: { id: 'qa-q', kind: 'sticky', text: title, at: [2.5, 1.5] } },
    { say: `${who} asked: ${title}` },
    { add: { id: 'qa-a', kind: 'box', text: 'No private key\n→ only the program\ncan sign (invoke_signed)', at: [8, 2], ...(source ? { source } : {}) } },
    { add: { id: 'qa-e', kind: 'arrow', from: 'qa-q', to: 'qa-a' } },
    { say: 'Short answer: a PDA is off the curve, so no key exists. The runtime lets the program sign for it by re-deriving the address from the seeds.' },
  ];
}

export function mockThreadReply(text: string): { markdown: string; steps: BoardStep[] } {
  return {
    markdown: `**(mock thread tutor)** Let's dig into _${text}_.\n\nThe bump is the first value counting down from 255 that pushes the hash off the ed25519 curve.`,
    steps: [
      { add: { id: `t-${Date.now().toString(36)}`, kind: 'sticky', text: text.slice(0, 60) } },
      { say: 'Here is the idea in one picture.' },
    ],
  };
}

export function mockSummary(title: string): string {
  return `${title}:\n• The tutor drew the core idea step by step.\n• The class answered a quick check.`;
}

const PDA_CARDS: ProposedCards['cards'] = [
  { front: 'Why does a PDA have no private key?', back: 'It is derived from seeds and the program id and lies off the ed25519 curve, so no keypair exists for it.' },
  { front: 'What inputs derive a PDA?', back: 'The seeds, the program id and a bump.' },
  { front: 'Which bump does find_program_address try first?', back: '255; it counts down until the hash lands off the curve.' },
  { front: 'Who can sign for a PDA?', back: 'Only the program that derived it, through invoke_signed.' },
  { front: 'How does the runtime check a PDA signature in invoke_signed?', back: 'It re-derives the address from the seeds; if it matches, the PDA counts as a signer.' },
];

/** The class deck: PDA cards for the scripted lesson, otherwise one card per planned segment. */
export function mockCards(plan?: LessonPlan): ProposedCards {
  if (!plan || plan.topic === PDA_PLAN.topic) return { cards: PDA_CARDS };
  const cards = plan.segments.slice(0, 11).map((s) => ({ front: `${s.title}: what was the goal?`.slice(0, 300), back: s.objective.slice(0, 600) }));
  cards.push({ front: 'What was this class about?', back: plan.topic.slice(0, 600) });
  while (cards.length < 3) cards.push({ front: `Name one idea from "${plan.topic}".`.slice(0, 300), back: (plan.segments[0]?.title ?? plan.topic).slice(0, 600) });
  return { cards };
}

// ---------------------------------------------------------------------------
// Triage: word-overlap clustering, good enough for a scripted demo.
// ---------------------------------------------------------------------------

export interface MockTriageInput {
  questions: { id: string; text: string; authorId: string }[];
  clusters: { id: string; title: string; askerIds: string[] }[];
  /** recent questions per asker, for the "3rd question on one subtopic → thread" rule */
  history: Record<string, string[]>;
}

const STOP = new Set('a an the is are was why how what can does do of to in on for it its this that i you we not cant can\'t with by and or'.split(' '));
const words = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const similar = (a: string, b: string) => {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.min(x.size, y.size);
};

export function mockTriage(input: MockTriageInput): TriageResult {
  const out: TriageResult = { assign: [], route: [], flag: [] };
  const clusters = input.clusters.map((c) => ({ ...c, askerIds: [...c.askerIds] }));
  const created: { key: string; title: string; askerIds: string[] }[] = [];
  for (const q of input.questions) {
    const hit = clusters.find((c) => similar(c.title, q.text) >= 0.5);
    if (hit) {
      out.assign.push({ questionId: q.id, cluster: hit.id });
      if (!hit.askerIds.includes(q.authorId)) hit.askerIds.push(q.authorId);
      continue;
    }
    const mine = created.find((c) => similar(c.title, q.text) >= 0.5);
    if (mine) {
      out.assign.push({ questionId: q.id, cluster: 'new', title: mine.title });
      if (!mine.askerIds.includes(q.authorId)) mine.askerIds.push(q.authorId);
      continue;
    }
    created.push({ key: q.id, title: q.text, askerIds: [q.authorId] });
    out.assign.push({ questionId: q.id, cluster: 'new', title: q.text });
  }
  for (const c of [...clusters.map((c) => ({ key: c.id, title: c.title, askerIds: c.askerIds })), ...created]) {
    const asker = c.askerIds[0];
    const past = (input.history[asker] ?? []).filter((t) => similar(t, c.title) >= 0.34).length;
    if (c.askerIds.length >= 2) out.route.push({ cluster: c.key, to: 'class', reason: `${c.askerIds.length} askers` });
    else if (past >= 2) out.route.push({ cluster: c.key, to: 'thread', user: asker, reason: 'repeated questions on one subtopic' });
    else out.route.push({ cluster: c.key, to: 'inline', answer: 'Short answer (mock): a PDA is derived from seeds and has no private key, so only its program can sign for it.' });
  }
  // created clusters are referenced by title in route (see TriageResult docs)
  out.route = out.route.map((r) => {
    const c = created.find((x) => x.key === r.cluster);
    return c ? { ...r, cluster: c.title } : r;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Syllabus: a course outline in the Chalkroom checkbox Markdown (parseSyllabus).
// ---------------------------------------------------------------------------

/** A course outline drafted from a title and goal: five topics from basics to practice. */
export function mockSyllabus(title: string, goal?: string): string {
  const t = title.trim() || 'New course';
  const topics = [
    `${t}: the big picture`,
    `${t}: core ideas`,
    `${t}: worked examples`,
    `${t}: common mistakes`,
    goal?.trim() ? `Practice: ${goal.trim().replace(/[.\s]+$/, '').slice(0, 80)}` : `${t}: practice`,
  ];
  const ids = ['big-picture', 'core-ideas', 'worked-examples', 'common-mistakes', 'practice'];
  const lines = topics.map((x, i) => `- [ ] ${x}  <!-- id: ${ids[i]} -->`);
  return [`# ${t}`, '', ...(goal?.trim() ? [goal.trim(), ''] : []), ...lines, ''].join('\n');
}

// ---------------------------------------------------------------------------
// Live activities (lane M): the quiz duel and the teach-back critique.
// ---------------------------------------------------------------------------

/** One objective duel question: mcq (answer = option index), tf (boolean) or numeric. */
export interface MockDuelQuestion {
  type: 'mcq' | 'tf' | 'numeric';
  prompt: string;
  options?: string[];
  answer: number | boolean;
  tolerance?: number;
  /** the concept it tests, named in "The tutor will re-teach: ..." */
  topic: string;
  explanation?: string;
  /** the lesson segment it comes from */
  segment: number;
}

const PDA_DUEL: MockDuelQuestion[] = [
  { segment: 0, type: 'mcq', prompt: 'Who can sign for a PDA?', options: ['Anyone holding its private key', 'Only the program that derived it', 'The wallet that paid its rent'], answer: 1, topic: 'Who signs for a PDA', explanation: 'A PDA has no private key; its program signs with invoke_signed.' },
  { segment: 0, type: 'tf', prompt: 'A PDA lies on the ed25519 curve.', answer: false, topic: 'PDAs lie off the curve', explanation: 'It is chosen off the curve, so no private key exists for it.' },
  { segment: 0, type: 'mcq', prompt: 'Which inputs derive a PDA?', options: ['A keypair and a nonce', 'Seeds, the program id and a bump', 'The payer and the slot'], answer: 1, topic: 'What derives a PDA', explanation: 'Seeds, the program id and the bump go into the hash.' },
  { segment: 1, type: 'numeric', prompt: 'Which bump value does find_program_address try first?', answer: 255, topic: 'The canonical bump', explanation: 'It starts at 255 and counts down.' },
  { segment: 1, type: 'tf', prompt: 'find_program_address counts the bump upward from 0.', answer: false, topic: 'The canonical bump', explanation: 'It counts down from 255.' },
  { segment: 1, type: 'mcq', prompt: 'How often does the very first bump work?', options: ['Almost never', 'About half the time', 'Always'], answer: 1, topic: 'Finding the bump', explanation: 'Each try lands off the curve about half the time.' },
  { segment: 2, type: 'mcq', prompt: 'What does the runtime do in invoke_signed?', options: ['Checks a private key', 'Re-derives the PDA from the seeds', 'Asks the wallet to approve'], answer: 1, topic: 'Signing with invoke_signed', explanation: 'If the re-derived address matches, the PDA counts as a signer.' },
  { segment: 2, type: 'tf', prompt: 'A program stores the private key of its PDA.', answer: false, topic: 'Signing with invoke_signed', explanation: 'There is no key to store.' },
];

/**
 * `count` duel questions on what was taught so far (segments 0..taughtUpTo of the PDA lesson),
 * topped up from later segments when the class has not seen enough yet.
 */
export function mockDuel(count: number, taughtUpTo = 0): { questions: MockDuelQuestion[] } {
  const seen = PDA_DUEL.filter((q) => q.segment <= taughtUpTo);
  const rest = PDA_DUEL.filter((q) => q.segment > taughtUpTo);
  return { questions: [...seen, ...rest].slice(0, Math.max(1, count)) };
}

const PDA_IDEAS: { idea: string; words: RegExp }[] = [
  { idea: 'A PDA is derived from seeds and the program id', words: /seed|program id|derive/i },
  { idea: 'It lies off the ed25519 curve', words: /curve|ed25519/i },
  { idea: 'So no private key exists for it', words: /private key|no key|keypair/i },
  { idea: 'Only its program signs for it, with invoke_signed', words: /invoke_signed|invoke signed|program (can )?sign|signs? for/i },
];

/** The tutor's critique of a teach-back: what was right, what was missing, and one board note. */
export function mockTeachbackFeedback(concept: string, text: string, name = 'You'): { markdown: string; missing: string[]; steps: BoardStep[] } {
  const right = PDA_IDEAS.filter((i) => i.words.test(text)).map((i) => i.idea);
  const missing = PDA_IDEAS.filter((i) => !i.words.test(text)).map((i) => i.idea);
  const first = name.split(/\s+/)[0] || name;
  const markdown = [
    `**(mock tutor)** Thank you, ${first}. ${right.length ? 'You got the heart of it.' : 'Good try; let us fill in the core idea together.'}`,
    right.length ? `What was right: ${right.join('; ')}.` : '',
    'In one line: a PDA comes from seeds and the program id and lies off the curve, so it has no key and only its program signs for it.',
  ].filter(Boolean).join('\n\n');
  const steps: BoardStep[] = [
    { page: { title: `Teach-back: ${concept}`.slice(0, 80) } },
    { add: { id: 'tb-right', kind: 'box', text: right.length ? right.slice(0, 2).join('\n') : 'Seeds + program id\n-> PDA', at: [2.8, 2] } },
    { say: `${first} explained it. Here is what to add.` },
    ...(missing.length ? [{ add: { id: 'tb-missing', kind: 'sticky' as const, text: missing.slice(0, 2).join('\n'), at: [2.8, 4.4] } } as BoardStep] : []),
    { say: missing.length ? `The missing piece: ${missing[0]}.` : 'Nothing important was missing.' },
  ];
  return { markdown, missing, steps };
}

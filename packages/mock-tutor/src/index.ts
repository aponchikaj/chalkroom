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

// The dev preview's lesson (Solana Program Derived Addresses): static fixture content for
// /dev/classroom, for design and screenshots only. Not a tutor; it never reaches the API.
import type { BoardStep, LessonPlan, TeachSegment } from '@chalk/schema';

export const DEV_PLAN: LessonPlan = {
  topic: 'Program Derived Addresses',
  segments: [
    { title: 'What is a PDA?', objective: 'Explain why a PDA has no private key.' },
    { title: 'Finding the bump', objective: 'Describe how find_program_address picks the bump.' },
    { title: 'Signing with invoke_signed', objective: 'Explain how a program signs for its PDA.' },
  ],
};

export const DEV_SEGMENTS: TeachSegment[] = [
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

/** A board answer to a grouped class question, crediting the askers. */
export function devClusterAnswer(title: string, askers: string[]): BoardStep[] {
  const who = askers.length > 1 ? `${askers.slice(0, -1).join(', ')} and ${askers[askers.length - 1]}` : askers[0] ?? 'someone';
  return [
    { page: { title: `Q&A: ${title}` } },
    { add: { id: 'qa-q', kind: 'sticky', text: title, at: [2.5, 1.5] } },
    { say: `${who} asked: ${title}` },
    { add: { id: 'qa-a', kind: 'box', text: 'No private key\n→ only the program\ncan sign (invoke_signed)', at: [8, 2] } },
    { add: { id: 'qa-e', kind: 'arrow', from: 'qa-q', to: 'qa-a' } },
    { say: 'Short answer: a PDA is off the curve, so no key exists. The runtime lets the program sign for it by re-deriving the address from the seeds.' },
  ];
}

/** A segment summary card (three short lines). */
export function devSummary(title: string): string {
  return `${title}:\n• The tutor drew the core idea step by step.\n• The class answered a quick check.`;
}

/** A thread tutor reply to a learner's message, with a sticky on the mini board. */
export function devThreadReply(text: string): { markdown: string; steps: BoardStep[] } {
  return {
    markdown: `Let's dig into _${text}_.\n\nThe bump is the first value counting down from 255 that pushes the hash off the ed25519 curve.`,
    steps: [
      { add: { id: `t-${Date.now().toString(36)}`, kind: 'sticky', text: text.slice(0, 60) } },
      { say: 'Here is the idea in one picture.' },
    ],
  };
}

// The landing page's demo lesson (Solana Program Derived Addresses): static page illustration
// that the hero replays on its own silent board and the sections quote. It is not a tutor and
// never reaches the API; every real class is taught by the model.
import type { BoardStep, ProposedCards, TeachSegment } from '@chalk/schema';

/** The first part of the lesson: the figure, the formula, the narration and its check. */
export const DEMO_SEGMENT: TeachSegment = {
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
};

/** The tutor's board answer to a grouped class question, crediting the askers. */
export function demoClusterAnswer(title: string, askers: string[]): BoardStep[] {
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

/** The class flashcard deck shown under "After class". */
export const DEMO_CARDS: ProposedCards['cards'] = [
  { front: 'Why does a PDA have no private key?', back: 'It is derived from seeds and the program id and lies off the ed25519 curve, so no keypair exists for it.' },
  { front: 'What inputs derive a PDA?', back: 'The seeds, the program id and a bump.' },
  { front: 'Which bump does find_program_address try first?', back: '255; it counts down until the hash lands off the curve.' },
  { front: 'Who can sign for a PDA?', back: 'Only the program that derived it, through invoke_signed.' },
  { front: 'How does the runtime check a PDA signature in invoke_signed?', back: 'It re-derives the address from the seeds; if it matches, the PDA counts as a signer.' },
];

// Test fixtures built in code, so no binary files live in the repo.
import type { LessonPlan, TeachSegment } from '@chalk/schema';

/** A minimal valid PDF with one line of text per page. */
export function makePdf(pages: string[]): Buffer {
  const objs: string[] = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objs[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offs.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A sample lesson (Solana PDAs): realistic Board Script for tests of the board, narration and
 *  streaming. Test data only; the API has no scripted tutor. */
export const SAMPLE_PLAN: LessonPlan = {
  topic: 'Program Derived Addresses',
  segments: [
    { title: 'What is a PDA?', objective: 'Explain why a PDA has no private key.' },
    { title: 'Finding the bump', objective: 'Describe how find_program_address picks the bump.' },
    { title: 'Signing with invoke_signed', objective: 'Explain how a program signs for its PDA.' },
  ],
};

export const SAMPLE_SEGMENTS: TeachSegment[] = [
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

// Fixed eval cases. Small on purpose: Groq's free tier allows ~8000 tokens/min per model, so a
// full run takes minutes. Each case covers a failure seen in real classes or a demo-critical path.
import type { LessonPlan } from '@chalk/schema';

export interface LeadCase { id: string; title: string; plan: LessonPlan; segment: number }

export const LEAD: LeadCase[] = [
  { id: 'pda', title: 'Solana PDAs', segment: 0, plan: { topic: 'Program Derived Addresses', segments: [
    { title: 'What is a PDA?', objective: 'Explain why a PDA has no private key.' },
    { title: 'Finding the bump', objective: 'Describe how find_program_address picks the bump.' },
    { title: 'Signing with invoke_signed', objective: 'Explain how a program signs for its PDA.' }] } },
  { id: 'photosynthesis', title: 'Photosynthesis', segment: 1, plan: { topic: 'Photosynthesis', segments: [
    { title: 'Inputs and outputs', objective: 'Name what a leaf takes in and gives out.' },
    { title: 'Light reactions', objective: 'Explain how chlorophyll turns light into chemical energy.' },
    { title: 'The Calvin cycle', objective: 'Describe how CO2 becomes sugar.' }] } },
  { id: 'listcomp', title: 'Python list comprehensions', segment: 0, plan: { topic: 'List comprehensions', segments: [
    { title: 'From loop to comprehension', objective: 'Rewrite a filtering for-loop as a list comprehension.' },
    { title: 'Nested comprehensions', objective: 'Read a nested comprehension left to right.' }] } },
  { id: 'georgian', title: 'ფოტოსინთეზი', segment: 0, plan: { topic: 'ფოტოსინთეზი', segments: [
    { title: 'რას იღებს და რას გამოყოფს ფოთოლი', objective: 'ახსნა, რას იყენებს მცენარე და რას გამოყოფს ფოტოსინთეზის დროს.' },
    { title: 'ქლოროფილი', objective: 'ახსნა, როგორ იჭერს ქლოროფილი სინათლეს.' }] } },
];

export interface TriageCase {
  id: string;
  segment: number;
  plan: LessonPlan;
  questions: { id: string; text: string; authorId: string }[];
  /** question id -> gold group label */
  groups: Record<string, string>;
  /** gold group label -> acceptable routes (or 'flag') */
  routes: Record<string, string[]>;
  history?: Record<string, string[]>;
}

const PDA_PLAN = LEAD[0].plan;

export const TRIAGE: TriageCase[] = [
  { id: 'same-question', segment: 0, plan: PDA_PLAN,
    questions: [{ id: 'q1', text: 'Why can a PDA not sign?', authorId: 'u1' }, { id: 'q2', text: "Why can't a PDA sign transactions?", authorId: 'u2' }],
    groups: { q1: 'sign', q2: 'sign' }, routes: { sign: ['class'] } },
  { id: 'different-questions', segment: 0, plan: PDA_PLAN,
    questions: [{ id: 'q1', text: 'What does rent exempt mean?', authorId: 'u1' }, { id: 'q2', text: 'Is a PDA the same as a public key?', authorId: 'u2' }],
    groups: { q1: 'rent', q2: 'pubkey' }, routes: { rent: ['inline', 'later'], pubkey: ['inline', 'class'] } },
  { id: 'two-plus-one', segment: 0, plan: PDA_PLAN,
    questions: [
      { id: 'q1', text: 'Who pays for creating the PDA account?', authorId: 'u1' },
      { id: 'q2', text: 'When I create a PDA, which wallet pays the fee?', authorId: 'u2' },
      { id: 'q3', text: 'Can two programs share one PDA?', authorId: 'u3' }],
    groups: { q1: 'pays', q2: 'pays', q3: 'share' }, routes: { pays: ['class'], share: ['inline', 'later', 'class'] } },
  { id: 'covered-later', segment: 0, plan: PDA_PLAN,
    questions: [{ id: 'q1', text: 'How does invoke_signed actually work?', authorId: 'u1' }],
    groups: { q1: 'invoke' }, routes: { invoke: ['later'] } },
  { id: 'deep-dive', segment: 1, plan: PDA_PLAN,
    questions: [{ id: 'q1', text: 'Can the bump ever be zero, and what happens then?', authorId: 'u3' }],
    history: { u3: ['Why does the bump start at 255?', 'How many tries does finding the bump take on average?'] },
    groups: { q1: 'bump' }, routes: { bump: ['thread'] } },
  // holdout cases for triage prompt changes: a thread must not be offered for unrelated history
  { id: 'unrelated-history', segment: 0, plan: PDA_PLAN,
    questions: [{ id: 'q1', text: 'Is a PDA address 32 bytes long like a normal public key?', authorId: 'u5' }],
    history: { u5: ['What does rent exempt mean?', 'How are transaction fees paid?'] },
    groups: { q1: 'size' }, routes: { size: ['inline', 'class'] } },
  { id: 'deep-dive-2', segment: 1, plan: LEAD[1].plan,
    questions: [{ id: 'q1', text: 'Why does chlorophyll absorb blue light better than green?', authorId: 'u6' }],
    history: { u6: ['What wavelengths does chlorophyll absorb?', 'Why is chlorophyll a different from chlorophyll b?'] },
    groups: { q1: 'chloro' }, routes: { chloro: ['thread'] } },
  { id: 'three-askers', segment: 0, plan: PDA_PLAN,
    questions: [
      { id: 'q1', text: 'What are seeds in a PDA?', authorId: 'u1' },
      { id: 'q2', text: 'What exactly do you pass as seeds?', authorId: 'u2' },
      { id: 'q3', text: 'Can seeds be any bytes?', authorId: 'u3' }],
    groups: { q1: 'seeds', q2: 'seeds', q3: 'seeds' }, routes: { seeds: ['class'] } },
  { id: 'spam', segment: 0, plan: PDA_PLAN,
    questions: [{ id: 'q1', text: 'BUY CHEAP FOLLOWERS at followers-now dot com!!!', authorId: 'u4' }],
    groups: { q1: 'spam' }, routes: { spam: ['flag'] } },
];

export const SCRIBE = [
  { id: 'pda-seg0', title: 'What is a PDA?', key: /private key/i,
    transcript: 'Normal accounts are owned by a keypair.\nA PDA is derived from seeds and the program id.\nBecause the result lies off the curve, no private key exists for it.\nCheck: Who can sign for a PDA?\n\nLearners asked:\n- Why can a PDA not sign?' },
  { id: 'listcomp-seg0', title: 'From loop to comprehension', key: /comprehension/i,
    transcript: 'Here is a loop that keeps the positive numbers and squares them.\nThe same thing in one line is [x * x for x in xs if x > 0].\nRead it as: the result, then the loop, then the filter.\nCheck: What does [x for x in range(3)] give?' },
];

export const ANSWER = [
  { id: 'pda-sign', plan: PDA_PLAN, title: 'Why a PDA cannot sign', questions: ['Why can a PDA not sign?', "Why can't a PDA sign transactions?"], askers: ['Ana', 'Gio'] },
];

export const THREAD = [
  { id: 'bump-deep', plan: PDA_PLAN, topic: 'bump seeds', text: 'Why does find_program_address start at 255 and count down?' },
  { id: 'calvin', plan: LEAD[1].plan, topic: 'Calvin cycle', text: 'Where exactly does the CO2 end up, and why does the cycle need ATP?' },
  { id: 'listcomp-nested', plan: LEAD[2].plan, topic: 'nested comprehensions', text: 'Can you show me how [x*y for x in a for y in b] runs step by step?' },
];

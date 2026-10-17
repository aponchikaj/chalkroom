// Retrieval eval (B12): keyword-only vs hybrid (keywords + local embeddings) on a labeled set.
// Loads a small corpus into a throwaway course on the LOCAL database, asks questions worded
// unlike the passages, scores hit@1, hit@3 and MRR, then deletes the course.
// Usage (from the repo root, local Supabase running): npm run eval:retrieval
import { createClient } from '@supabase/supabase-js';
import { LocalEmbeddings } from '../src/rag/embeddings/local.embeddings';
import { searchQuery } from '../src/rag/retrieval';
import { hitAtK, reciprocalRank } from './metrics';

const PASSAGES: Record<string, string> = {
  'pda-key': 'A program derived address is computed from seeds and the program id. The result is pushed off the ed25519 curve, so no private key exists for it and no wallet can produce a signature for it.',
  'pda-sign': 'Only the owning program can authorize actions for its PDA. It does so with invoke_signed, passing the same seeds and the bump so the runtime can re-derive the address and accept it as a signer.',
  'pda-bump': 'find_program_address starts with the bump 255 and counts down, hashing the seeds each time, until the hash lands off the curve. The first value that works is the canonical bump.',
  'rent': 'Every account must hold a minimum balance of lamports proportional to its size. An account above that line is rent exempt and is never charged or purged.',
  'fees': 'The payer named in the instruction funds the new account: its lamports cover the rent-exempt minimum, and the transaction fee is taken from the fee payer wallet.',
  'photo-io': 'A leaf takes in carbon dioxide through its stomata and water through its roots, and with the energy of sunlight it releases oxygen and stores glucose.',
  'photo-chloro': 'Chlorophyll absorbs red and blue light and reflects green light, which is why leaves look green. The absorbed energy splits water in the light reactions.',
  'photo-calvin': 'In the Calvin cycle the enzyme RuBisCO fixes carbon dioxide onto a five-carbon sugar; ATP and NADPH from the light reactions then turn it into three-carbon sugars.',
  'list-basic': 'The expression [x * x for x in nums if x > 0] builds a new list in one line: first the value to keep, then the loop, then an optional filter.',
  'list-nested': 'A nested comprehension such as [y for row in grid for y in row] reads left to right like the equivalent nested for loops, outer loop first.',
  'list-gen': 'Round brackets instead of square ones give a generator expression, which yields items lazily and does not build the whole list in memory.',
  'ka-chloro': 'ქლოროფილი შთანთქავს წითელ და ლურჯ სინათლეს და ირეკლავს მწვანეს, ამიტომ ფოთლები მწვანე ფერისაა.',
  'ka-io': 'ფოთოლი ნახშირორჟანგს სტომებით იღებს, წყალს ფესვებით, ხოლო მზის ენერგიით გამოყოფს ჟანგბადს და ინახავს გლუკოზას.',
};

/** [question, relevant passage ids]. Mostly paraphrases; a few share words with the text. */
const QUESTIONS: [string, string[]][] = [
  ['Why is a PDA unable to sign on its own?', ['pda-key', 'pda-sign']],
  ['How does a program approve something on behalf of an address it owns?', ['pda-sign']],
  ['Which seed number is tried at the start of the search?', ['pda-bump']],
  ['What is the canonical bump?', ['pda-bump']],
  ['Who pays when a new account gets created?', ['fees']],
  ['How much SOL must an account keep so it is not deleted?', ['rent']],
  ['What goes into a leaf and what comes out?', ['photo-io']],
  ['Why are plants green?', ['photo-chloro']],
  ['Which enzyme grabs CO2 from the air?', ['photo-calvin']],
  ['Where do the energy carriers from the light stage get used?', ['photo-calvin']],
  ['How do I write a one-line filtered list in Python?', ['list-basic']],
  ['In what order do I read two for clauses inside brackets?', ['list-nested']],
  ['How can I avoid building the entire list in memory?', ['list-gen']],
  ['რატომ არის ფოთლები მწვანე?', ['ka-chloro', 'photo-chloro']],
  ['რას გამოყოფს მცენარე მზის სინათლეზე?', ['ka-io', 'photo-io']],
  ['What does a leaf release in sunlight?', ['photo-io', 'ka-io']],
  // exact terms from the material, where keyword search should help rather than hurt
  ['invoke_signed seeds', ['pda-sign']],
  ['RuBisCO', ['photo-calvin']],
  ['generator expression', ['list-gen']],
  ['stomata', ['photo-io']],
  ['ed25519 curve', ['pda-key', 'pda-bump']],
];

const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!/127\.0\.0\.1|localhost/.test(url ?? '')) throw new Error('retrieval eval runs against the LOCAL database only');
const db = createClient(url, key, { auth: { persistSession: false } });
const emb = new LocalEmbeddings();

const t0 = Date.now();
await emb.warm();
const loadMs = Date.now() - t0;

const course = await db.from('courses').insert({ title: 'retrieval eval (temporary)', visibility: 'private' }).select('id').single();
if (course.error) throw new Error(course.error.message);
const courseId = course.data.id as string;
try {
  const src = await db.from('sources').insert({ course_id: courseId, kind: 'faq', title: 'eval corpus', status: 'ready' }).select('id').single();
  if (src.error) throw new Error(src.error.message);
  const ids = Object.keys(PASSAGES);
  const t1 = Date.now();
  const vectors = await emb.embed(ids.map((id) => PASSAGES[id]), 'document');
  const docMs = Date.now() - t1;
  const ins = await db.from('chunks').insert(ids.map((id, i) => ({
    source_id: src.data.id, idx: i, page: null, heading: id, content: PASSAGES[id], token_count: Math.ceil(PASSAGES[id].length / 4), embedding: `[${vectors[i].join(',')}]`,
  })));
  if (ins.error) throw new Error(ins.error.message);

  const modes = { keyword: { h1: 0, h3: 0, rr: 0 }, hybrid: { h1: 0, h3: 0, rr: 0 }, vector: { h1: 0, h3: 0, rr: 0 } };
  const queryMs: number[] = [];
  const misses: string[] = [];
  for (const [q, relevant] of QUESTIONS) {
    const t = Date.now();
    const [v] = await emb.embed([q], 'query');
    queryMs.push(Date.now() - t);
    const vec = `[${v.join(',')}]`;
    for (const [mode, args] of [['keyword', { p_query: searchQuery(q), p_embedding: null }], ['hybrid', { p_query: searchQuery(q), p_embedding: vec }], ['vector', { p_query: null, p_embedding: vec }]] as const) {
      const r = await db.rpc('match_chunks', { ...args, p_room: null, p_course: courseId, p_k: 5 });
      if (r.error) throw new Error(r.error.message);
      const ranked = (r.data as { heading: string }[]).map((c) => c.heading);
      const m = modes[mode];
      m.h1 += hitAtK(ranked, relevant, 1); m.h3 += hitAtK(ranked, relevant, 3); m.rr += reciprocalRank(ranked, relevant);
      if (mode === 'hybrid' && !hitAtK(ranked, relevant, 3)) misses.push(`${q} -> ${ranked.slice(0, 3).join(', ') || '(nothing)'}`);
    }
  }
  const n = QUESTIONS.length, pct = (x: number) => `${Math.round((100 * x) / n)}%`;
  queryMs.sort((a, b) => a - b);
  console.log(`\n## retrieval (${new Date().toISOString()})\n`);
  console.log(`${n} questions, ${ids.length} passages; model load ${loadMs} ms, ${ids.length} passages embedded in ${docMs} ms, query embedding p50 ${queryMs[Math.floor(n / 2)]} ms\n`);
  console.log('| Mode | hit@1 | hit@3 | MRR |\n|---|---|---|---|');
  for (const [mode, m] of Object.entries(modes)) console.log(`| ${mode} | ${pct(m.h1)} | ${pct(m.h3)} | ${(m.rr / n).toFixed(2)} |`);
  if (misses.length) console.log(`\nhybrid misses (top 3):\n${misses.map((m) => `- ${m}`).join('\n')}`);
} finally {
  await db.from('sources').delete().eq('course_id', courseId);
  await db.from('courses').delete().eq('id', courseId);
}
process.exit(0);

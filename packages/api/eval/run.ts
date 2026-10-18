// Agent evals against the real model (Groq), paced to the free tier. Production prompts are not
// touched: a variant swaps prompt text and reasoning effort in memory for this process only.
// Usage (from the repo root):
//   npm run eval -- --variant baseline --only lead,triage,scribe,answer,thread
// Writes packages/api/eval/results/<time>-<variant>.json and prints a Markdown summary.
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { planTriage } from '../src/triage/triage-plan';
import { PROMPTS, roomPrefix } from '../src/agents/prompts';
import { LeadTutorAgent, type TeachChunk } from '../src/agents/lead-tutor.agent';
import { TriageAgent } from '../src/agents/triage.agent';
import { ScribeAgent } from '../src/agents/scribe.agent';
import { ThreadTutorAgent } from '../src/agents/thread-tutor.agent';
import { ModelPort, type ModelEvent, type ModelRequest } from '../src/agents/model.port';
import { GroqModel } from '../src/agents/groq.model';
import { config } from '../src/config';
import { ANSWER, LEAD, SCRIBE, THREAD, TRIAGE } from './cases';
import { pairwiseAgreement, scoreTeach } from './metrics';
import { VARIANTS, stripDescriptions } from './variants';

interface Call { agent: string; tool: string; ms: number; input: number; output: number; error?: string }

class Recorder extends ModelPort {
  readonly name = 'recorder';
  calls: Call[] = [];
  constructor(private inner: ModelPort, private bare = false) { super(); }
  async *stream(req: ModelRequest): AsyncIterable<ModelEvent> {
    if (this.bare) req = { ...req, tool: { ...req.tool, input_schema: stripDescriptions(req.tool.input_schema) as typeof req.tool.input_schema } };
    const t0 = Date.now();
    const call: Call = { agent: req.agent, tool: req.tool.name, ms: 0, input: 0, output: 0 };
    try {
      for await (const e of this.inner.stream(req)) {
        if (e.type === 'done' && e.usage) { call.input = e.usage.input + e.usage.cacheRead; call.output = e.usage.output; }
        yield e;
      }
    } catch (err) {
      call.error = (err as Error).message.slice(0, 200);
      throw err;
    } finally {
      call.ms = Date.now() - t0;
      this.calls.push(call);
    }
  }
}

const arg = (name: string, dflt: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const variantName = arg('variant', 'baseline');
const only = new Set(arg('only', 'lead,triage,scribe,answer,thread').split(','));
const variant = VARIANTS[variantName];
if (!variant) throw new Error(`unknown variant ${variantName}; known: ${Object.keys(VARIANTS).join(', ')}`);
Object.assign(PROMPTS, variant.prompts ?? {});

// the free tier under test: Gemini when its key is set (or MODEL=gemini), else Groq
const gemini = config.model === 'gemini';
const key = gemini ? process.env.GEMINI_API_KEY : process.env.GROQ_API_KEY;
if (!key) throw new Error(`${gemini ? 'GEMINI_API_KEY' : 'GROQ_API_KEY'} missing (.env.local)`);
console.log(`Note: every eval case makes real model calls (${gemini ? 'Gemini' : 'Groq'} free tier).`);
const spares = gemini ? config.geminiSpares : config.groqSpares;
const modelFor = (agent: string, tool: string) => (tool === 'plan_lesson' || tool === 'answer_cluster' ? config.agentModels.triage : config.agentModels[agent as keyof typeof config.agentModels]);
// the eval can wait longer for per-minute quota (90 s); spares as in production
const groq = new GroqModel(key, modelFor as never, (agent, tool) => variant.effort?.(agent, tool), spares, () => 90_000, gemini ? 'gemini' : 'groq', config.geminiRpm);
const rec = new Recorder(groq, variant.bareSchemas);
const lead = new LeadTutorAgent(rec), triage = new TriageAgent(rec), scribe = new ScribeAgent(rec), thread = new ThreadTutorAgent(rec);

type Row = Record<string, unknown> & { case: string; calls: Call[] };
const results: Record<string, Row[]> = {};
async function run(kind: string, id: string, fn: () => Promise<Record<string, unknown>>) {
  const before = rec.calls.length;
  let out: Record<string, unknown>;
  for (let attempt = 0; ; attempt++) {
    try { out = await fn(); } catch (e) { out = { failed: (e as Error).message.slice(0, 200) }; }
    // out of daily budget is not a result: wait until Groq says the model is back, then redo the case
    if (!String(out.failed ?? '').includes('model can take this request now') || attempt >= 6) break;
    const back = Math.min(...[...new Set([...(typeof spares === 'function' ? (['lead', 'thread', 'triage', 'scribe'] as const).flatMap((a) => spares(a)) : spares), ...Object.values(config.agentModels)])].map((m) => groq.availableAt(m)).filter((t) => t > Date.now()));
    const wait = Math.max(30_000, (Number.isFinite(back) ? back : Date.now()) - Date.now() + 5_000);
    console.log(`${kind}/${id}: daily budget used up, waiting ${Math.round(wait / 60_000)} min`);
    await new Promise((r) => setTimeout(r, wait));
    rec.calls.splice(before);
  }
  const calls = rec.calls.slice(before);
  const row: Row = { case: id, ...out, firstTry: calls.length === 1 && !calls[0].error && !out.failed, calls };
  (results[kind] ??= []).push(row);
  console.log(`${kind}/${id}: ${out.failed ? `FAILED ${out.failed}` : 'ok'} (${calls.length} call(s), ${calls.reduce((a, c) => a + c.ms, 0)} ms)`);
}

if (only.has('lead')) for (const c of LEAD) await run('lead', c.id, async () => {
  const prefix = roomPrefix({ title: c.title }, c.plan);
  const steps: TeachChunk[] = [];
  for await (const chunk of lead.teach({ prefix, plan: c.plan, segment: c.segment, slower: false, summaries: [] })) steps.push(chunk);
  const seg = { title: c.plan.segments[c.segment].title, steps: steps.flatMap((s) => ('steps' in s ? s.steps : [])), check: steps.map((s) => ('check' in s ? s.check : undefined)).find(Boolean) };
  const says = seg.steps.map((s) => (s as { say?: string }).say).filter(Boolean).join(' ');
  // a Georgian plan should be taught in Georgian: share of letters in the Georgian script
  const georgian = (says.match(/[\u10A0-\u10FF]/g) ?? []).length / Math.max(1, (says.match(/\p{L}/gu) ?? []).length);
  return { ...scoreTeach(seg as never), georgianShare: Math.round(100 * georgian) / 100, output: seg };
});

if (only.has('answer')) for (const c of ANSWER) await run('answer', c.id, async () => {
  const steps = await lead.answerCluster(roomPrefix({ title: 'Solana PDAs' }, c.plan), c.title, c.questions, c.askers);
  const s = scoreTeach({ title: c.title, steps } as never);
  const firstSay = (steps.find((x) => 'say' in x) as { say?: string } | undefined)?.say ?? '';
  return { ...s, creditsAskers: c.askers.every((a) => firstSay.includes(a)) };
});

if (only.has('thread')) for (const c of THREAD) await run('thread', c.id, async () => {
  const out = await thread.reply({ prefix: roomPrefix({ title: 'Solana PDAs' }, c.plan), mainBoard: {}, topic: c.topic, history: [] }, c.text);
  const s = out.steps?.length ? scoreTeach({ title: c.topic, steps: out.steps } as never) : null;
  return { markdownChars: out.markdown.length, steps: out.steps?.length ?? 0, danglingRefs: s?.danglingRefs ?? 0, longSays: s?.longSays ?? 0 };
});

if (only.has('triage')) for (const c of TRIAGE) await run('triage', c.id, async () => {
  const prefix = roomPrefix({ title: 'Solana PDAs' }, c.plan, { board: false });
  const result = await triage.run({ prefix, segment: c.segment, segmentTitle: c.plan.segments[c.segment].title, questions: c.questions, clusters: [], history: c.history ?? {} });
  const plan = planTriage(result, c.questions, []);
  const pred: Record<string, string | null> = Object.fromEntries(plan.questions.map((q) => [q.questionId, q.clusterKey]));
  const routeOf = (qid: string) => {
    const q = plan.questions.find((x) => x.questionId === qid)!;
    return q.status === 'flagged' ? 'flag' : plan.clusters.find((cl) => cl.key === q.clusterKey)?.route ?? 'none';
  };
  const labels = [...new Set(Object.values(c.groups))];
  const routesOk = labels.filter((g) => c.routes[g].includes(routeOf(Object.keys(c.groups).find((q) => c.groups[q] === g)!))).length / labels.length;
  const unassigned = c.questions.filter((q) => !result.assign.some((a) => a.questionId === q.id) && !result.flag.some((f) => f.questionId === q.id)).length;
  return { grouping: pairwiseAgreement(c.groups, pred), routes: routesOk, unassigned, got: labels.map((g) => `${g}:${routeOf(Object.keys(c.groups).find((q) => c.groups[q] === g)!)}`).join(' ') };
});

if (only.has('scribe')) for (const c of SCRIBE) await run('scribe', c.id, async () => {
  const summary = await scribe.summarize(roomPrefix({ title: 'class' }, null, { board: false }), c.title, c.transcript);
  const lines = summary.split('\n').filter((l) => l.trim()).length;
  return { lines, mentionsKey: c.key.test(summary), chars: summary.length };
});

// ---------------------------------------------------------------------------
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${Math.round(100 * x)}%`;
const summary: string[] = [`## ${variantName} (${new Date().toISOString()})`, '', '| Agent | Cases | First try | Quality | Tokens in / out (mean) | Latency p50 |', '|---|---|---|---|---|---|'];
for (const [kind, rows] of Object.entries(results)) {
  const calls = rows.flatMap((r) => r.calls);
  const ms = calls.map((c) => c.ms).sort((a, b) => a - b);
  let quality = '';
  if (kind === 'lead') quality = `ka ${(rows.find((r) => r.case === 'georgian')?.georgianShare as number | undefined) ?? '-'}, check ${pct(mean(rows.map((r) => (r.checkComplete ? 1 : 0))))}, dangling ${rows.reduce((a, r) => a + ((r.danglingRefs as number) ?? 0), 0)}, long says ${rows.reduce((a, r) => a + ((r.longSays as number) ?? 0), 0)}, max shapes/page ${Math.max(0, ...rows.map((r) => (r.maxShapesPerPage as number) ?? 0))}, failed ${rows.filter((r) => r.failed).length}`;
  if (kind === 'triage') quality = `grouping ${pct(mean(rows.map((r) => (r.grouping as number) ?? 0)))}, routes ${pct(mean(rows.map((r) => (r.routes as number) ?? 0)))}, unassigned ${rows.reduce((a, r) => a + ((r.unassigned as number) ?? 0), 0)}`;
  if (kind === 'scribe') quality = `<=3 lines ${pct(mean(rows.map((r) => ((r.lines as number) <= 3 ? 1 : 0))))}, key idea ${pct(mean(rows.map((r) => (r.mentionsKey ? 1 : 0))))}`;
  if (kind === 'answer') quality = `credits askers ${pct(mean(rows.map((r) => (r.creditsAskers ? 1 : 0))))}, dangling ${rows.reduce((a, r) => a + ((r.danglingRefs as number) ?? 0), 0)}`;
  if (kind === 'thread') quality = `steps ${rows.map((r) => r.steps).join(',')}, dangling ${rows.reduce((a, r) => a + ((r.danglingRefs as number) ?? 0), 0)}`;
  summary.push(`| ${kind} | ${rows.length} | ${pct(mean(rows.map((r) => (r.firstTry ? 1 : 0))))} | ${quality} | ${Math.round(mean(calls.map((c) => c.input)))} / ${Math.round(mean(calls.map((c) => c.output)))} | ${ms[Math.floor(ms.length / 2)] ?? 0} ms |`);
}
const dir = new URL('./results/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL(`${new Date().toISOString().replace(/[:.]/g, '-')}-${variantName}.json`, dir), JSON.stringify({ variant: variantName, results }, null, 2));
console.log(`\n${summary.join('\n')}\n`);
for (const [kind, rows] of Object.entries(results)) for (const r of rows) if (kind === 'triage') console.log(`triage/${r.case}: ${r.got}`);
process.exit(0);

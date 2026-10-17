# Plan: prompt tuning on Groq, and meaning-based search for RAG

Dev B, 2026-10-17. Two tracks, both measured with evals before and after every change.

## Analysis

### What a Groq call costs today (measured)

| Call | Model | Input tokens | Output tokens | Of which |
|---|---|---|---|---|
| `teach_segment` | gpt-oss-120b | 3300-5500 | 700-1200 | tool schema ~2600, board-script prompt ~1100, classroom + plan + notes ~500 |
| `answer_cluster` | gpt-oss-20b | ~4800 | ~300-400 | tool schema ~2300 (same Board Script steps) |
| thread `reply` | qwen3.8-27b | ~5300 | ~450-950 | tool schema ~2300 |
| `triage` | gpt-oss-20b | 1000-1400 | 150-320 | schema ~340 |
| `summarize` | gpt-oss-20b | 300-650 | 180-560 | |
| `plan_lesson` | gpt-oss-20b | ~640-2200 | 150-390 | |

Each free model allows **8000 tokens per minute**, so one teaching call uses most of the lead
tutor's minute.

### Levers found

1. **Reasoning effort.** The gpt-oss models reason before answering, and the hidden reasoning
   counts as output tokens. Groq accepts `reasoning_effort`: on `gpt-oss-20b` the same answer
   took 72 tokens at `low`, 274 at the default `medium`, 400 at `high`; Qwen accepts `none`.
   We send nothing today, i.e. `medium` everywhere.
2. **Board Script is described twice.** The tool's JSON schema (18 descriptions) and the
   `board-script.md` prompt both explain the shapes. One of them can be shorter.
3. **Observed failures on Groq:** an invalid step after the repair pass (`steps.14: Invalid
   input`), a segment without a check (simple-mode retry, fixed), triage naming a new cluster
   differently in `assign` and `route` (fixed with a stricter prompt and an example).
4. **Search is keyword-only.** "Why can't it sign?" finds nothing about `invoke_signed` unless
   the words overlap. Groq has no embeddings API.

### Constraints

- Free tier: 8000 tokens/min per model; evals must pace themselves (minutes per run).
- `MODEL=mock` must keep running a full class; prompts are shared by every provider.
- The cached room prefix must stay byte-stable within a class.
- Georgian and English content (Hacktoberfest Georgia): the embedding model must be multilingual.

## Track A: prompt tuning (eval-driven)

### Success criteria

| Agent | Metric | Target |
|---|---|---|
| Lead `teach_segment` | valid on the first try (no repair pass) | >= 90% |
| | reducer errors when replayed (unknown ids, bad arrows) | 0 |
| | shapes per page | <= 10 |
| | `say` steps: present, short (<= 35 words) | 100% |
| | a check with an answer and an explanation | 100% |
| | input + output tokens | -25% vs baseline |
| Triage | questions in the right groups (pairwise agreement with labels) | >= 90% |
| | right route on labeled cases | >= 80% |
| | nothing unassigned, inline answers present | 100% |
| Scribe | 3 short lines, mentions the segment's key idea | 100% |
| All | latency p50 | no worse than baseline |

### Method

1. **Eval harness** in `packages/api/eval/`: fixed cases, the real agent code with the real
   Groq adapter (paced), pure scoring functions (unit-tested), results as JSON plus a Markdown
   table. Prompt variants are swapped in memory, so production code is not touched by an eval.
2. **Baseline** the current prompts.
3. **Candidates**, one lever at a time, same cases: reasoning effort per agent; a shorter
   board-script prompt; tighter tool descriptions; lead prompt rules for the observed failures.
4. **Keep** a change only when its metric improves without a regression elsewhere; log every
   run in this file.

## Track B: meaning-based search

### Choice

Local embeddings with `@huggingface/transformers` (ONNX on CPU) and **multilingual-e5-small**:
384 dimensions, 100+ languages (Georgian included), about 120 MB once, then offline and free.
It needs `query: ` / `passage: ` prefixes, which map onto `EmbeddingPort`'s `query` / `document`.

### Changes

1. Migration: `chunks.embedding` becomes `vector(384)`; `match_chunks()` takes `vector(384)`
   (existing embeddings are all null, so nothing to convert).
2. `LocalEmbeddings` adapter behind `EmbeddingPort`; model loaded once at boot (warm-up),
   batches of 32; `EMBEDDINGS=local` by default, `none` for full text only.
3. The ingest worker already embeds when a provider is set; the retrieval service already
   sends the query vector; `match_chunks()` already fuses both rankings.

### Success criteria (retrieval eval)

A labeled set: a small corpus of chunks and questions worded differently from the text, each
with the chunk(s) that answer it. Measure **hit@3** and **MRR** for keyword-only versus hybrid.
Target: hybrid hit@3 >= 85% and clearly above keyword-only; query embedding < 50 ms.

## Findings that changed the plan

- **Daily budgets, not just per-minute ones.** Each free Groq model also has a tokens-per-day
  cap (TPD, rolling 24 h): `gpt-oss-120b` 200k. A class uses ~30k lead tokens (plan, 3-4
  segments, Q&A), so the 120b lead runs about **6 classes a day**, then 429s. Fix: when a model
  is out of its daily budget the adapter skips it until Groq says it is back and uses the next
  spare (`GROQ_SPARES`, default `gpt-oss-20b`, `gpt-oss-120b`). Every token saved per call is
  more classes per day, which makes token reduction the main tuning goal.
- **qwen3.8-27b caps output at 1000 tokens/min (OTPM).** It cannot be a spare for the lead (a
  segment is ~1000 output tokens plus reasoning) and refuses with "Request too large". Fix: qwen
  is no longer a spare, and a size refusal moves that one request to the next spare.
- **qwen sends `steps` as a JSON string** sometimes; Groq rejects the call (`tool_use_failed`).
  Fix: top-level fields that are JSON text are unwrapped before validation.
- **Segments without a check.** `check` was optional in the tool schema and the models skipped
  it (2/2 successful baseline segments, and earlier real classes). Fix: the `teach_segment`
  tool requires `check`; validation stays lenient so a segment without one is still taught.
- Only three Groq chat models exist on this key: `gpt-oss-120b`, `gpt-oss-20b`, `qwen3.8-27b`.

## Run log

Lead variants run on `gpt-oss-20b` (same family, own daily budget) to spare the 120b budget;
the winner is then checked on `gpt-oss-120b`.

| Date | Run | Result | Decision |
|---|---|---|---|
| 10-17 | baseline, all agents (120b out of daily budget: lead fell to qwen) | lead 2/4 failed (qwen OTPM, no tool call), check 0/2; answer ok, credits askers; thread 0/1 (steps as string); triage grouping 100%, routes 83% (deep-dive sent inline, not thread); scribe 2/2 | fixes above; triage thread rule candidate |
| 10-17 | retrieval, 21 questions | keyword hit@1 76%, MRR 0.83; hybrid (equal weights) 90%, 0.95; vector only 95%, 0.98 | keyword weight 0.5 |
| 10-17 | retrieval, keyword weight 0.5 / 0.3 | hybrid 95%, MRR 0.98 (both) | keep 0.5 (smallest change at the plateau) |
| 10-17 | lead baseline on 20b (check now required) | 4/4 first try, check 100%, Georgian taught in Georgian (0.98), 0 dangling, max 11 shapes/page; 4943 in / 1270 out | keep |
| 10-17 | lead `bare` (schema descriptions out) | input -46% (2672), but first try 50%, Georgian plan taught in English (0.00), answer_cluster broken JSON | reject: the descriptions carry real guidance |
| 10-17 | lead `low` effort | 2/4 before the 20b daily budget ran out; check 50%, 2 dangling refs | reject (small sample, but worse on every metric it reached) |
| 10-17 | lead `lean` | not run: 20b and 120b daily budgets used up | - |
| 10-17 | thread baseline vs `none` effort (qwen) | both 2/3 before the XML / string repairs; after them `none` 3/3 but 0 mini-board steps (baseline drew 13) and one 26-char reply | reject: saves tokens by dropping the board |
| 10-17 | triage `threadFirst` (+ 3 holdout cases) | not run: gpt-oss-20b daily budget used up | ready in `eval/variants.ts`; run when the budget is back, ship only if routes improve with no holdout regression |

## Outcome so far

Shipped (each with a failing test first): required `check` in the teach tool; daily-budget and
output-cap fallback across models; qwen-safe spares; repair of JSON-string fields and of qwen's
XML tool calls; reasoning effort plumbing (unused by default: no effort level won). The prompts
themselves are unchanged: no candidate beat the baseline. RAG: local multilingual embeddings,
keyword weight 0.5, backfill of old chunks.

Residual risks: the lead has ~6 classes/day on 120b before falling to 20b; one segment had 11
shapes on a page; triage sends a learner's third deep question inline rather than as a thread.

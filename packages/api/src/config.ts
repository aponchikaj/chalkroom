import { homedir, hostname } from 'node:os';
import { join } from 'node:path';

// Environment for the API. `npm run env` at the repo root writes .env from `supabase status`.
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}. Run "npm run db:start" then "npm run env" at the repo root.`);
  return v;
};

type Provider = 'anthropic' | 'gemini' | 'groq' | 'mock';
function provider(): Provider {
  const m = process.env.MODEL;
  if (m === 'anthropic' || m === 'gemini' || m === 'groq' || m === 'mock') return m;
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.GEMINI_API_KEY ? 'gemini' : process.env.GROQ_API_KEY ? 'groq' : 'mock';
}
/** a free tier (testing only): paced, no pipelining */
const freeTier = () => provider() === 'gemini' || provider() === 'groq';
/** default model per agent on each free tier: each model has its own limits, so they are spread */
const FREE_MODELS = {
  // lead on 3.6-flash: the same lesson quality as 3.8-flash in the eval, 12 s instead of 19 s
  gemini: { lead: 'gemini-3.6-flash', thread: 'gemini-3.8-flash', triage: 'gemini-3.5-flash-lite', scribe: 'gemini-3.5-flash-lite' },
  groq: { lead: 'openai/gpt-oss-120b', thread: 'qwen/qwen3.8-27b', triage: 'openai/gpt-oss-20b', scribe: 'openai/gpt-oss-20b' },
};

export const config = {
  /** hosts (Render, Railway, Fly) set PORT; API_PORT locally */
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 3001),
  /** the web app's address (invite links); WEB_URL may list several, comma-separated, first wins */
  webUrl: (process.env.WEB_URL ?? 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, ''),
  /** origins allowed to call the API (CORS): every WEB_URL entry; `*` matches within one host label,
   *  e.g. https://chalkroom-*.vercel.app for Vercel preview deployments */
  webOrigins: (process.env.WEB_URL ?? 'http://localhost:5173').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
    .map((o) => (o.includes('*') ? new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]*')}$`) : o)),
  supabaseUrl: need('SUPABASE_URL'),
  supabaseServiceKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  /** 'anthropic' (production: Claude Haiku 5.5) needs ANTHROPIC_API_KEY; the free tiers for
   *  testing: 'gemini' (GEMINI_API_KEY) and 'groq' (GROQ_API_KEY); 'mock' runs the scripted
   *  lesson. Default: the first key set in that order, else mock. MODEL forces one. */
  model: provider(),
  /** model id of the lead tutor (logs and /health); every agent's id is in agentModels */
  modelId: process.env.MODEL_ID ?? (provider() === 'gemini' || provider() === 'groq' ? FREE_MODELS[provider() as 'gemini' | 'groq'].lead : 'claude-haiku-5-5'),
  /** delay between scripted steps in mock mode, so the board still "streams" */
  mockDelayMs: Number(process.env.MOCK_DELAY_MS ?? 400),
  /** Model per agent. MODEL_ID sets all four; MODEL_ID_LEAD / _THREAD / _TRIAGE / _SCRIBE override one.
   *  Groq defaults spread the agents over three models: each free-tier model has its own
   *  8000 tokens-per-minute budget. */
  agentModels: (() => {
    const p = provider();
    const free = p === 'gemini' || p === 'groq' ? FREE_MODELS[p] : null;
    const all = process.env.MODEL_ID;
    const pick = (agent: 'lead' | 'thread' | 'triage' | 'scribe') => process.env[`MODEL_ID_${agent.toUpperCase()}`] ?? all ?? free?.[agent] ?? 'claude-haiku-5-5';
    return { lead: pick('lead'), thread: pick('thread'), triage: pick('triage'), scribe: pick('scribe') };
  })(),
  /** B1 pipelining (write the next segment during the gate). Off by default on Groq's free tier:
   *  it doubles the lead tutor's tokens per minute. PIPELINE=1/0 overrides. */
  pipeline: process.env.PIPELINE ? process.env.PIPELINE === '1' : !freeTier(),
  /** B6: tokens (input + output) a room may spend before the backup tutor takes over */
  roomTokenBudget: Number(process.env.ROOM_TOKEN_BUDGET ?? 300_000),
  /** this instance's id for room leases, stable across its own restarts: "<group>/<host:port>".
   *  Instances take over abandoned rooms only within their group (INSTANCE_GROUP; the e2e
   *  suite's API is "e2e", so the dev API never drives its rooms). INSTANCE_ID overrides. */
  instanceId: process.env.INSTANCE_ID ?? `${process.env.INSTANCE_GROUP ?? 'main'}/${hostname()}:${process.env.PORT ?? process.env.API_PORT ?? 3001}`,
  /** resume live rooms at boot. Off for extra instances (tests) so two APIs never drive one room. */
  resumeRooms: process.env.RESUME_ROOMS !== '0',
  /** accounts required (B9): anonymous Supabase sessions are refused. REQUIRE_ACCOUNT=0 opts out. */
  requireAccount: process.env.REQUIRE_ACCOUNT !== '0',
  /** email (2FA codes, B11). Without SMTP_URL mail is logged, not sent. */
  mail: {
    smtpUrl: process.env.SMTP_URL || null,
    from: process.env.MAIL_FROM ?? 'Chalkroom <no-reply@chalkroom.local>',
  },
  /** HMAC key for email 2FA codes (B11). Required before email 2FA is turned on. */
  otpSecret: process.env.OTP_SECRET || null,
  /** Groq models to fall back to, in order, when an agent's own model is out of its daily
   *  budget (TPD) or refuses a request's size. Not qwen3.8-27b: its 1000 output tokens per
   *  minute cannot hold a teaching segment. */
  groqSpares: (process.env.GROQ_SPARES ?? 'openai/gpt-oss-20b,openai/gpt-oss-120b').split(',').map((m) => m.trim()).filter(Boolean),
  /** Gemini spares, in order, when a model's daily request quota is used up (~20 requests a day
   *  per Flash model on the free tier). The tutors try the other Flash model before Lite; triage
   *  and the scribe stay on Lite models so they never use up the Flash quota. */
  geminiSpares: (agent: 'lead' | 'thread' | 'triage' | 'scribe'): string[] => {
    const list = (v: string | undefined, d: string) => (v ?? d).split(',').map((m) => m.trim()).filter(Boolean);
    return agent === 'lead' || agent === 'thread'
      ? list(process.env.GEMINI_SPARES_TUTOR, 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite')
      : list(process.env.GEMINI_SPARES_LITE, 'gemini-3.5-flash-lite,gemini-3.1-flash-lite');
  },
  /** Gemini free tier: requests per minute per model (not published; ~10 reported) */
  geminiRpm: Number(process.env.GEMINI_RPM ?? 10),
  /** RAG embeddings (B12): 'local' runs multilingual-e5-small in the API; 'none' is full-text search only. */
  embeddings: {
    provider: (process.env.EMBEDDINGS === 'none' ? 'none' : 'local') as 'local' | 'none',
  },
  /** Server voice: 'kokoro' makes each narration sentence once (Kokoro-82M on the CPU) and stores it
   *  in the public `tts` bucket; 'off' (default) leaves the web on the system voice. */
  tts: {
    engine: (process.env.TTS === 'kokoro' ? 'kokoro' : 'off') as 'kokoro' | 'off',
    /** fp32 is the fastest on x86 CPUs (RTF ~0.4 on 6 cores); q8 is smaller but slower */
    dtype: (process.env.TTS_DTYPE ?? 'fp32') as 'fp32' | 'fp16' | 'q8' | 'q4',
    /** model files (~330 MB for fp32); the image bakes them in */
    cacheDir: process.env.TTS_CACHE ?? join(homedir(), '.cache', 'chalkroom-models'),
    /** ONNX intra-op threads; 0 lets onnxruntime pick (all cores) */
    threads: Number(process.env.TTS_THREADS ?? 0),
  },
  /** dev console at /sandbox. On by default only against a local Supabase; SANDBOX=1/0 overrides. */
  sandbox: process.env.SANDBOX ? process.env.SANDBOX === '1' : /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.SUPABASE_URL ?? ''),
};

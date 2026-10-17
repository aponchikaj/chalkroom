import { hostname } from 'node:os';

// Environment for the API. `npm run env` at the repo root writes .env from `supabase status`.
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}. Run "npm run db:start" then "npm run env" at the repo root.`);
  return v;
};

function provider(): 'groq' | 'anthropic' | 'mock' {
  const m = process.env.MODEL;
  if (m === 'groq' || m === 'anthropic' || m === 'mock') return m;
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.GROQ_API_KEY ? 'groq' : 'mock';
}

export const config = {
  /** hosts (Render, Railway, Fly) set PORT; API_PORT locally */
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 3001),
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  supabaseUrl: need('SUPABASE_URL'),
  supabaseServiceKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  /** 'anthropic' (production: Claude Sonnet 5.5) needs ANTHROPIC_API_KEY; 'groq' (free tier,
   *  for testing) needs GROQ_API_KEY; 'mock' runs the scripted lesson. Default: anthropic when
   *  its key is set, else groq when its key is set, else mock. MODEL forces one. */
  model: provider(),
  /** model id of the lead tutor (logs and /health); every agent's id is in agentModels */
  modelId: process.env.MODEL_ID ?? (provider() === 'groq' ? 'openai/gpt-oss-120b' : 'claude-sonnet-5-5'),
  /** delay between scripted steps in mock mode, so the board still "streams" */
  mockDelayMs: Number(process.env.MOCK_DELAY_MS ?? 400),
  /** Model per agent. MODEL_ID sets all four; MODEL_ID_LEAD / _THREAD / _TRIAGE / _SCRIBE override one.
   *  Groq defaults spread the agents over three models: each free-tier model has its own
   *  8000 tokens-per-minute budget. */
  agentModels: (() => {
    const groq = provider() === 'groq';
    const all = process.env.MODEL_ID;
    const pick = (agent: string, groqDefault: string) => process.env[`MODEL_ID_${agent}`] ?? all ?? (groq ? groqDefault : 'claude-sonnet-5-5');
    return { lead: pick('LEAD', 'openai/gpt-oss-120b'), thread: pick('THREAD', 'qwen/qwen3.8-27b'), triage: pick('TRIAGE', 'openai/gpt-oss-20b'), scribe: pick('SCRIBE', 'openai/gpt-oss-20b') };
  })(),
  /** B1 pipelining (write the next segment during the gate). Off by default on Groq's free tier:
   *  it doubles the lead tutor's tokens per minute. PIPELINE=1/0 overrides. */
  pipeline: process.env.PIPELINE ? process.env.PIPELINE === '1' : provider() !== 'groq',
  /** dev console at /sandbox. On by default only against a local Supabase; SANDBOX=1/0 overrides. */
  /** resume live rooms at boot. Off for extra instances (tests) so two APIs never drive one room. */
  /** B6: tokens (input + output) a room may spend before the backup tutor takes over */
  roomTokenBudget: Number(process.env.ROOM_TOKEN_BUDGET ?? 300_000),
  /** this instance's id for room leases; stable across its own restarts (host + port) */
  /** "<group>/<host:port>": instances take over abandoned rooms only within their group
   *  (INSTANCE_GROUP; the e2e suite's API is "e2e", so the dev API never drives its rooms) */
  instanceId: process.env.INSTANCE_ID ?? `${process.env.INSTANCE_GROUP ?? 'main'}/${hostname()}:${process.env.PORT ?? process.env.API_PORT ?? 3001}`,
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
  /** RAG embeddings (B12): 'local' runs multilingual-e5-small in the API; 'none' is full-text search only. */
  embeddings: {
    provider: (process.env.EMBEDDINGS === 'none' ? 'none' : 'local') as 'local' | 'none',
  },
  sandbox: process.env.SANDBOX ? process.env.SANDBOX === '1' : /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.SUPABASE_URL ?? ''),
};

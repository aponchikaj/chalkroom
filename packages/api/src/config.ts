import { hostname } from 'node:os';

// Environment for the API. `npm run env` at the repo root writes .env from `supabase status`.
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}. Run "npm run db:start" then "npm run env" at the repo root.`);
  return v;
};

export const config = {
  port: Number(process.env.API_PORT ?? 3001),
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  supabaseUrl: need('SUPABASE_URL'),
  supabaseServiceKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  /** 'groq' needs GROQ_API_KEY, 'anthropic' needs ANTHROPIC_API_KEY, 'mock' runs the scripted lesson.
   *  Default: groq when its key is set, else anthropic when its key is set, else mock. */
  model: (process.env.MODEL ?? (process.env.GROQ_API_KEY ? 'groq' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock')) as 'groq' | 'anthropic' | 'mock',
  /** model id for all four agents; default per provider */
  modelId: process.env.MODEL_ID ?? (process.env.MODEL === 'anthropic' || (!process.env.GROQ_API_KEY && process.env.ANTHROPIC_API_KEY) ? 'claude-haiku-4-5' : 'openai/gpt-oss-120b'),
  /** delay between scripted steps in mock mode, so the board still "streams" */
  mockDelayMs: Number(process.env.MOCK_DELAY_MS ?? 400),
  /** Model per agent. MODEL_ID sets all four; MODEL_ID_LEAD / _THREAD / _TRIAGE / _SCRIBE override one.
   *  Groq defaults spread the agents over three models: each free-tier model has its own
   *  8000 tokens-per-minute budget. */
  agentModels: (() => {
    const groq = (process.env.MODEL ?? (process.env.GROQ_API_KEY ? 'groq' : '')) === 'groq';
    const all = process.env.MODEL_ID;
    const pick = (agent: string, groqDefault: string) => process.env[`MODEL_ID_${agent}`] ?? all ?? (groq ? groqDefault : 'claude-haiku-4-5');
    return { lead: pick('LEAD', 'openai/gpt-oss-120b'), thread: pick('THREAD', 'qwen/qwen3.8-27b'), triage: pick('TRIAGE', 'openai/gpt-oss-20b'), scribe: pick('SCRIBE', 'openai/gpt-oss-20b') };
  })(),
  /** B1 pipelining (write the next segment during the gate). Off by default on Groq's free tier:
   *  it doubles the lead tutor's tokens per minute. PIPELINE=1/0 overrides. */
  pipeline: process.env.PIPELINE ? process.env.PIPELINE === '1' : (process.env.MODEL ?? (process.env.GROQ_API_KEY ? 'groq' : '')) !== 'groq',
  /** dev console at /sandbox. On by default only against a local Supabase; SANDBOX=1/0 overrides. */
  /** resume live rooms at boot. Off for extra instances (tests) so two APIs never drive one room. */
  /** B6: tokens (input + output) a room may spend before the backup tutor takes over */
  roomTokenBudget: Number(process.env.ROOM_TOKEN_BUDGET ?? 300_000),
  /** this instance's id for room leases; stable across its own restarts (host + port) */
  instanceId: process.env.INSTANCE_ID ?? `${hostname()}:${process.env.PORT ?? process.env.API_PORT ?? 3001}`,
  resumeRooms: process.env.RESUME_ROOMS !== '0',
  /** accounts required: reject anonymous Supabase users. Off until the web ships login (B9). */
  requireAccount: process.env.REQUIRE_ACCOUNT === '1',
  /** email (2FA codes, B11). Without SMTP_URL mail is logged, not sent. */
  mail: {
    smtpUrl: process.env.SMTP_URL || null,
    from: process.env.MAIL_FROM ?? 'Chalkroom <no-reply@chalkroom.local>',
  },
  /** HMAC key for email 2FA codes (B11). Required before email 2FA is turned on. */
  otpSecret: process.env.OTP_SECRET || null,
  /** RAG embeddings (B12): 'none' means full-text search only. */
  embeddings: {
    provider: (process.env.EMBEDDINGS ?? (process.env.VOYAGE_API_KEY ? 'voyage' : 'none')) as 'voyage' | 'none',
    model: process.env.EMBEDDING_MODEL ?? 'voyage-3.5',
  },
  sandbox: process.env.SANDBOX ? process.env.SANDBOX === '1' : /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.SUPABASE_URL ?? ''),
};

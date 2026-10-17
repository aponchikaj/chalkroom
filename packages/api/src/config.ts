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
  /** 'anthropic' needs ANTHROPIC_API_KEY; 'mock' runs the scripted lesson. Defaults to anthropic when a key is set. */
  model: (process.env.MODEL ?? (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock')) as 'anthropic' | 'mock',
  modelId: process.env.MODEL_ID ?? 'claude-haiku-4-5',
  /** delay between scripted steps in mock mode, so the board still "streams" */
  mockDelayMs: Number(process.env.MOCK_DELAY_MS ?? 400),
  /** dev console at /sandbox. On by default only against a local Supabase; SANDBOX=1/0 overrides. */
  sandbox: process.env.SANDBOX ? process.env.SANDBOX === '1' : /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.SUPABASE_URL ?? ''),
};

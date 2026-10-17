// Makes sure the stack is up before the e2e suite runs. Reuses an API already running in mock
// mode; otherwise starts one (MODEL=mock, fast mock delay) and stops it afterwards.
import { spawn, type ChildProcess } from 'node:child_process';
import { API, ROOT, env, sleep } from './helpers';

let child: ChildProcess | null = null;

const MOCK_PORT = 3101;

async function health(): Promise<{ model: string } | null> {
  try {
    const r = await fetch(`${process.env.E2E_API_URL ?? API}/health`);
    return r.ok ? ((await r.json()) as { model: string }) : null;
  } catch {
    return null;
  }
}

export async function setup() {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) throw new Error('No Supabase settings in .env. Run: npm run db:start && npm run env');
  try {
    await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/health`, { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } });
  } catch {
    throw new Error(`Supabase is not reachable at ${env.VITE_SUPABASE_URL}. Run: npm run db:start`);
  }

  const running = await health();
  if (running?.model === 'mock') return;
  // anything else (a dev API on a real model, or one restarting right now): run the suite
  // against our own mock instance on its own port, so no model calls are spent and nothing
  // collides with the dev API's port
  process.env.E2E_API_URL = `http://localhost:${MOCK_PORT}`;
  if (await health()) return;

  child = spawn('npm', ['run', 'start', '-w', '@chalk/api'], {
    cwd: ROOT,
    env: { ...process.env, MODEL: 'mock', MOCK_DELAY_MS: '50', API_PORT: String(MOCK_PORT), PORT: String(MOCK_PORT), RESUME_ROOMS: '0', SANDBOX: '0', INSTANCE_GROUP: 'e2e' },
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true, // own process group, so teardown stops npm and node together
  });
  for (let i = 0; i < 60; i++) {
    if (await health()) return;
    await sleep(500);
  }
  throw new Error(`The API did not come up on ${process.env.E2E_API_URL ?? API} within 30 s`);
}

export async function teardown() {
  if (child?.pid) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}

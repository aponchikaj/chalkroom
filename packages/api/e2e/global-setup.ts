// Makes sure the stack is up before the e2e suite runs. Reuses an API already running in mock
// mode; otherwise starts one (MODEL=mock, fast mock delay) and stops it afterwards.
import { spawn, type ChildProcess } from 'node:child_process';
import { API, ROOT, env, sleep } from './helpers';

let child: ChildProcess | null = null;

async function health(): Promise<{ model: string } | null> {
  try {
    const r = await fetch(`${API}/health`);
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
  if (running) {
    if (running.model !== 'mock') throw new Error('The running API uses a real model. Restart it with MODEL=mock (or stop it and let the suite start one).');
    return;
  }

  child = spawn('npm', ['run', 'start', '-w', '@chalk/api'], {
    cwd: ROOT,
    env: { ...process.env, MODEL: 'mock', MOCK_DELAY_MS: '50' },
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true, // own process group, so teardown stops npm and node together
  });
  for (let i = 0; i < 60; i++) {
    if (await health()) return;
    await sleep(500);
  }
  throw new Error(`The API did not come up on ${API} within 30 s`);
}

export async function teardown() {
  if (child?.pid) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}

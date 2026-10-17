// Writes .env at the repo root from the running local Supabase (`supabase status -o env`).
// Keeps any lines you added yourself (ANTHROPIC_API_KEY, MODEL, …).
// For a hosted Supabase project, copy .env.example to .env and fill it in by hand instead.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const raw = execSync('npx supabase status -o env', { encoding: 'utf8' });
const status = Object.fromEntries([...raw.matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)].map((m) => [m[1], m[2]]));
const url = status.API_URL;
const anon = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
const service = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
if (!url || !anon || !service) {
  console.error('Could not read API_URL / ANON_KEY / SERVICE_ROLE_KEY from `supabase status`. Is it running? (npm run db:start)');
  process.exit(1);
}

const managed = {
  DATABASE_URL: status.DB_URL,
  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: service,
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_ANON_KEY: anon,
  VITE_API_URL: 'http://localhost:3001',
};
const keep = existsSync('.env')
  ? readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.trim() && !Object.keys(managed).some((k) => l.startsWith(`${k}=`)))
  : ['# MODEL=mock               # force the scripted tutor', '# ANTHROPIC_API_KEY=sk-ant-...  # set to use Claude Haiku 4.5'];
writeFileSync('.env', [...Object.entries(managed).map(([k, v]) => `${k}=${v}`), ...keep, ''].join('\n'));
console.log('Wrote .env for', url);

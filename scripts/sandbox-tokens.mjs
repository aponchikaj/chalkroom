// Signs in three anonymous users (Ana, Gio, Eve) and writes their tokens to
// packages/api/sandbox/.env, which packages/api/sandbox/api.http reads with {{$dotenv ...}}.
// Tokens last 1 hour on local Supabase; run again when requests start returning 401.
// Usage: npm run sandbox:tokens
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('No Supabase settings in .env. Run: npm run db:start && npm run env'); process.exit(1); }

const lines = [`API_URL=${env.VITE_API_URL ?? 'http://localhost:3001'}`, `SUPABASE_URL=${url}`, `ANON_KEY=${key}`];
for (const name of ['ANA', 'GIO', 'EVE']) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) { console.error(`sign-in failed: ${error.message}`); process.exit(1); }
  lines.push(`TOKEN_${name}=${data.session.access_token}`, `ID_${name}=${data.user.id}`);
}
writeFileSync('packages/api/sandbox/.env', lines.join('\n') + '\n');
console.log('Wrote packages/api/sandbox/.env (Ana, Gio, Eve). Open packages/api/sandbox/api.http in VS Code with REST Client.');

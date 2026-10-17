// Signs up three email users (Ana, Gio, Eve) and writes their tokens to
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
  const email = `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const { data, error } = await sb.auth.signUp({ email, password: 'Test-password-123', options: { data: { display_name: name[0] + name.slice(1).toLowerCase() } } });
  if (error || !data.session) { console.error(`sign-up failed: ${error?.message ?? 'no session'}`); process.exit(1); }
  lines.push(`TOKEN_${name}=${data.session.access_token}`, `ID_${name}=${data.user.id}`, `EMAIL_${name}=${email}`);
}
writeFileSync('packages/api/sandbox/.env', lines.join('\n') + '\n');
console.log('Wrote packages/api/sandbox/.env (Ana, Gio, Eve). Open packages/api/sandbox/api.http in VS Code with REST Client.');

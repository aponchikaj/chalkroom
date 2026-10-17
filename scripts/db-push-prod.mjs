// Applies supabase/migrations to the hosted (production) project. Run: npm run db:push:prod
// Reads DATABASE_URL from .env.production.local. Local dev never needs this: `npm run db:start`
// and `npm run db:reset` apply migrations to the local database.
//
// Safe by default: it prints the target host and the pending migrations (a dry run) and stops.
// Nothing changes until it is run again with --yes. The password never goes on the command line
// (other processes can read argv); the supabase CLI gets it through PGPASSWORD.
import { execFileSync } from 'node:child_process';

const raw = process.env.DATABASE_URL;
if (!raw || raw.includes('127.0.0.1') || raw.includes('localhost')) {
  console.error('DATABASE_URL in .env.production.local must point at the hosted project.');
  process.exit(1);
}
const url = new URL(raw);
const password = decodeURIComponent(url.password);
url.password = '';
const target = `${url.hostname}:${url.port || 5432} as ${decodeURIComponent(url.username)}`;
const env = { ...process.env, PGPASSWORD: password };
const push = (extra) => execFileSync('npx', ['supabase', 'db', 'push', '--db-url', url.toString(), ...extra], { stdio: 'inherit', env });

console.log(`Target: ${target}\n\nPending migrations (dry run, nothing is changed):`);
push(['--dry-run']);
if (!process.argv.includes('--yes')) {
  console.log('\nThis was a dry run. To apply these migrations to the hosted database, run:\n  npm run db:push:prod -- --yes');
  process.exit(0);
}
console.log(`\nApplying to ${target} ...`);
push([]);

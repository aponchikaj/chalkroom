// Applies supabase/migrations to the hosted (production) project. Run: npm run db:push:prod
// Reads DATABASE_URL from .env.production.local. Local dev never needs this: `npm run db:start`
// and `npm run db:reset` apply migrations to the local database.
import { execFileSync } from 'node:child_process';

const url = process.env.DATABASE_URL;
if (!url || url.includes('127.0.0.1') || url.includes('localhost')) {
  console.error('DATABASE_URL in .env.production.local must point at the hosted project.');
  process.exit(1);
}
const args = ['supabase', 'db', 'push', '--db-url', url];
if (process.argv.includes('--dry-run')) args.push('--dry-run');
execFileSync('npx', args, { stdio: 'inherit' });

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** The entry chunk budget (POLISH_PLAN): a build fails when index-*.js grows past it. */
const ENTRY_BUDGET_KB = 450;

function entryBudget(): Plugin {
  return {
    name: 'chalkroom-entry-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue;
        const kb = Buffer.byteLength(chunk.code) / 1000; // kB as Vite reports them
        if (kb > ENTRY_BUDGET_KB) {
          this.error(`entry chunk ${chunk.fileName} is ${kb.toFixed(2)} kB, over the ${ENTRY_BUDGET_KB} kB budget: move the new code behind a lazy import`);
        }
      }
    },
  };
}

// Env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL) comes from the repo-root .env
// (written by `npm run env`), overridden by .env.local.
export default defineConfig({
  plugins: [react(), entryBudget()],
  envDir: '../..',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, host: true },
});

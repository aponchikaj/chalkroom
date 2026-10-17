import { defineConfig } from 'vitest/config';

// API end-to-end suite: real local Supabase + API (mock tutor). Run with `npm run test:api`.
// Kept out of `npm test` because CI has no Supabase.
export default defineConfig({
  // outside node_modules: writes there restart the dev API's `node --watch` mid-run
  cacheDir: '.cache/vite',
  test: {
    include: ['packages/api/e2e/**/*.e2e.test.ts'],
    globalSetup: ['packages/api/e2e/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

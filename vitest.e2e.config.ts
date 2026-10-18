import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// API end-to-end suite: real local Supabase + API on a real model (costs model calls; needs a
// key). Run with `npm run test:api`. Kept out of `npm test`: CI has no Supabase and no key.
export default defineConfig({
  // outside the repo: cache writes inside it restart the dev API's `node --watch` mid-run
  cacheDir: join(tmpdir(), 'chalkroom-vite'),
  test: {
    include: ['packages/api/e2e/**/*.e2e.test.ts'],
    globalSetup: ['packages/api/e2e/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

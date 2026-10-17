import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// cacheDir outside the repo: Vitest's cache writes inside it restart the dev API's `node --watch`
export default defineConfig({
  cacheDir: join(tmpdir(), 'chalkroom-vite'),
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 30000,
  },
});

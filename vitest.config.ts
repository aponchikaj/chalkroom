import { defineConfig } from 'vitest/config';

// cacheDir outside node_modules: writes under node_modules restart the API's `node --watch`
export default defineConfig({
  cacheDir: '.cache/vite',
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 30000,
  },
});

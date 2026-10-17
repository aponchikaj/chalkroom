import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL) comes from the repo-root .env,
// written by `npm run env`.
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5173, host: true },
});

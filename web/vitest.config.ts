import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Frontend-scoped test config (jsdom + React Testing Library). Kept under `web/` and rooted
// here so it doesn't collide with the backend agent's root Vitest setup. Run via
// `npm run test:web`.
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'web',
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    server: {
      deps: {
        // Click UI ships ESM that imports its own `.css` files. Inline it so Vite (which
        // understands CSS imports) transforms it, instead of Node trying to load `.css`.
        inline: [/@clickhouse\/click-ui/],
      },
    },
  },
});

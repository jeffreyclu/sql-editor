import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend build/dev config (DL-007). The SPA lives in `web/`; the production build is
// emitted to `dist/public`, which the Express server serves at `/`. In dev, Vite serves
// the SPA and proxies the API to Express so everything is same-origin (no CORS).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/query': 'http://localhost:8080',
      '/api': 'http://localhost:8080',
    },
  },
});

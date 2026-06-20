import { defineConfig } from 'vitest/config';

/**
 * Backend (Node) test configuration.
 *
 * Scoped to `src/**` so it runs the Express/SQL backend tests in a Node environment.
 * When the frontend adds jsdom-based component tests, this should grow into Vitest
 * `projects` (a Node `server` project + a jsdom `web` project) rather than widening
 * the environment here.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

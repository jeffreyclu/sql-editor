import { defineConfig } from 'vitest/config';

/**
 * Root Vitest workspace (DL-015 / review HIGH-1): `npm test` runs BOTH projects in one go —
 * the Node backend suite (`src/**`) and the jsdom frontend suite (which keeps its own config
 * under `web/`). Filter with `vitest --project server` or `--project web`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      './web/vitest.config.ts',
    ],
  },
});

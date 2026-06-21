import express, { type ErrorRequestHandler, type Express } from 'express';
import fs from 'fs';
import path from 'path';
import { createClickHouseExecutor, type ExecutorFactory } from './clickhouse';
import { createDatabase } from './db/db';
import { createHistoryRepository, type HistoryRepository } from './db/historyRepository';
import { createSavedQueryRepository, type SavedQueryRepository } from './db/savedQueryRepository';
import { createQueryRouter } from './routes/query';
import { createHistoryRouter } from './routes/history';
import { createSavedQueriesRouter } from './routes/queries';
import { createImportRouter } from './routes/import';
import { createAiRouter } from './routes/ai';
import { createGeminiSqlGenerator, type SqlGenerator } from './ai/sqlGenerator';

/** Built SPA location (`vite build` → `dist/public`), served at `/` in production. */
const SPA_DIR = path.resolve(process.cwd(), 'dist/public');
const SPA_INDEX = path.join(SPA_DIR, 'index.html');

export interface AppDeps {
  /** ClickHouse executor factory; overridable in tests (DIP). Defaults to the real client. */
  createExecutor: ExecutorFactory;
  /** Server-side per-statement row cap; overridable in tests. */
  rowLimit?: number;
  /** Query-history persistence; defaults to a throwaway in-memory database. */
  historyRepository: HistoryRepository;
  /** Saved-query persistence; defaults to a throwaway in-memory database. */
  savedQueryRepository: SavedQueryRepository;
  /**
   * NL→SQL generator for the AI assistant (DL-031/DL-032); overridable in tests with a fake
   * (DIP). Defaults to a lazily-constructed Gemini generator so the app builds and runs
   * without `GEMINI_API_KEY` — the route's 503 guard fires before the generator is touched.
   */
  sqlGenerator: SqlGenerator;
}

/**
 * Express application factory. Mounting routes here (rather than in `index.ts`) keeps
 * the app fully constructable in tests with injected dependencies — no network, no
 * listening socket. Dependencies default to the production implementations.
 *
 * In production the built SPA is served at `/` (see {@link mountSpa}); in dev Vite
 * serves the SPA and proxies the API here, so this stays API-only.
 */
export function createApp(deps: Partial<AppDeps> = {}): Express {
  const { createExecutor = createClickHouseExecutor, rowLimit } = deps;
  const { historyRepository, savedQueryRepository } = resolveRepositories(deps);
  const sqlGenerator = deps.sqlGenerator ?? createLazyGeminiSqlGenerator();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/query', createQueryRouter({ createExecutor, rowLimit, historyRepository }));
  app.use('/import', createImportRouter({ createExecutor }));
  app.use('/api/history', createHistoryRouter({ historyRepository }));
  app.use('/api/queries', createSavedQueriesRouter({ savedQueryRepository }));
  app.use('/api/ai', createAiRouter({ sqlGenerator }));

  mountSpa(app);

  // Terminal handler: keep the `{ error }` JSON contract total, including failures thrown by
  // express.json() before a route runs (malformed body → 400, oversized payload → 413).
  app.use(jsonErrorHandler);

  return app;
}

const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(httpStatusFor(err)).json({
    error: err instanceof Error ? err.message : 'Internal server error',
  });
};

/** Honour a body-parser/HTTP error's own status (e.g. 400, 413); otherwise treat as 500. */
function httpStatusFor(err: unknown): number {
  const candidate = err as { status?: number; statusCode?: number };
  const status = candidate?.status ?? candidate?.statusCode;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : 500;
}

/**
 * A {@link SqlGenerator} that constructs the real Gemini generator lazily, on first use. This
 * keeps `createApp()` side-effect-free and lets the app build/run without `GEMINI_API_KEY`
 * (DL-031/DL-032): the AI route's 503 guard short-circuits before `generate` is ever called,
 * so the missing-key throw never fires unless a configured request actually reaches it.
 */
function createLazyGeminiSqlGenerator(): SqlGenerator {
  let delegate: SqlGenerator | undefined;
  return {
    generate(input) {
      delegate ??= createGeminiSqlGenerator();
      return delegate.generate(input);
    },
  };
}

/**
 * Use injected repositories when provided; otherwise provision a single throwaway
 * in-memory database. This keeps `createApp()` free of filesystem side effects in tests,
 * while production composes a file-backed database in `index.ts`.
 */
function resolveRepositories(deps: Partial<AppDeps>): {
  historyRepository: HistoryRepository;
  savedQueryRepository: SavedQueryRepository;
} {
  if (deps.historyRepository && deps.savedQueryRepository) {
    return {
      historyRepository: deps.historyRepository,
      savedQueryRepository: deps.savedQueryRepository,
    };
  }

  const db = createDatabase(':memory:');
  return {
    historyRepository: deps.historyRepository ?? createHistoryRepository(db),
    savedQueryRepository: deps.savedQueryRepository ?? createSavedQueryRepository(db),
  };
}

/**
 * Serve the built React SPA at `/` with a history-API fallback — but only when a
 * production build exists. In dev (Vite serves the SPA) and in tests there is no
 * build, so the backend stays API-only. Mounted after the API routes so it never
 * shadows them; the fallback skips the API namespaces.
 */
function mountSpa(app: Express): void {
  if (!fs.existsSync(SPA_INDEX)) {
    return;
  }

  app.use(express.static(SPA_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/query')) {
      next();
      return;
    }
    res.sendFile(SPA_INDEX);
  });
}

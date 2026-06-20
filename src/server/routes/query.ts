import { Router } from 'express';
import { splitStatements } from '../sql/splitStatements';
import { classifyStatement } from '../sql/classify';
import type { ClickHouseExecutor, ExecutorFactory } from '../clickhouse';
import type { HistoryRepository } from '../db/historyRepository';
import type { RunResponse, StatementResult, StatementStatus } from '../types';

/** Default server-side cap on rows returned per statement (DL-009). */
export const DEFAULT_ROW_LIMIT = 1000;

export interface QueryRouteDeps {
  /** Builds a ClickHouse executor for a request (injected for testability — DIP). */
  createExecutor: ExecutorFactory;
  /** Max rows returned per statement before truncation. Defaults to {@link DEFAULT_ROW_LIMIT}. */
  rowLimit?: number;
  /** When provided, every run is auto-logged here (success or error) — DL-013. */
  historyRepository?: HistoryRepository;
}

/**
 * `POST /query` — execute a single- or multi-statement SQL script (DL-004):
 *   1. validate the request body,
 *   2. split the script into statements (DL-003),
 *   3. classify + execute each in order, stopping on the first error,
 *   4. auto-log the run to history (DL-013),
 *   5. respond 200 with `{ statements }` (per-statement errors are data).
 *
 * Reserved 4xx/5xx: 400 for a missing/empty `query`, 500 for unexpected server faults.
 */
export function createQueryRouter({
  createExecutor,
  rowLimit = DEFAULT_ROW_LIMIT,
  historyRepository,
}: QueryRouteDeps): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const { query } = (req.body ?? {}) as { query?: unknown };
    if (typeof query !== 'string' || query.trim() === '') {
      res.status(400).json({ error: "'query' is required" });
      return;
    }

    let statements: string[] = [];
    try {
      statements = splitStatements(query);
      const executor = createExecutor(req.headers);
      const results: StatementResult[] = [];

      for (const statement of statements) {
        const result = await runStatement(executor, statement, rowLimit);
        results.push(result);
        if (result.status === 'error') {
          break; // stop-on-first-error; remaining statements are left unrun (DL-004)
        }
      }

      recordHistory(historyRepository, query, statements.length, results);
      res.status(200).json({ statements: results } satisfies RunResponse);
    } catch (error) {
      // Transport / unexpected server fault (e.g. client construction) — not a SQL error.
      const message = toErrorMessage(error);
      recordHistory(historyRepository, query, statements.length, [], message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}

/** Execute one classified statement, converting any execution error into a result. */
async function runStatement(
  executor: ClickHouseExecutor,
  statement: string,
  rowLimit: number,
): Promise<StatementResult> {
  const kind = classifyStatement(statement);

  try {
    if (kind === 'command') {
      const { query_id } = await executor.command(statement);
      return { statement, kind, status: 'success', queryId: query_id };
    }

    // Fetch one row past the limit so ClickHouse stops early (memory-bounded) yet we can
    // still detect whether more rows existed and flag truncation (DL-009).
    const result = await executor.query(statement, { maxRows: rowLimit + 1 });
    const body = await result.json<Record<string, unknown>>();

    const allRows = body.data ?? [];
    const truncated = allRows.length > rowLimit;
    const rows = truncated ? allRows.slice(0, rowLimit) : allRows;

    return {
      statement,
      kind,
      status: 'success',
      columns: (body.meta ?? []).map((column) => ({ name: column.name, type: column.type })),
      rows,
      rowCount: rows.length,
      truncated,
      elapsedMs: body.statistics ? Math.round(body.statistics.elapsed * 1000) : undefined,
      queryId: body.query_id ?? result.query_id,
    };
  } catch (error) {
    return { statement, kind, status: 'error', error: { message: toErrorMessage(error) } };
  }
}

/**
 * Best-effort history logging: summarizes a run and records it. A logging failure must
 * never break the query response, so errors here are swallowed (with a server-side log).
 */
function recordHistory(
  repository: HistoryRepository | undefined,
  sql: string,
  statementCount: number,
  results: StatementResult[],
  transportError?: string,
): void {
  if (!repository) {
    return;
  }

  const failed = results.find((result) => result.status === 'error');
  const status: StatementStatus = transportError || failed ? 'error' : 'success';
  const elapsedMs = results.reduce((total, result) => total + (result.elapsedMs ?? 0), 0);

  try {
    repository.create({
      sql,
      status,
      statementCount,
      elapsedMs: elapsedMs || undefined,
      error: transportError ?? failed?.error?.message,
    });
  } catch (error) {
    console.error('Failed to record query history:', error);
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}

import { createClient, type ResponseJSON } from '@clickhouse/client';
import type { IncomingHttpHeaders } from 'http';

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? 'http://localhost:8123';

/** Result of a data-returning statement — the slice of `ResultSet` the route uses. */
export interface QueryResult {
  query_id: string;
  json<T = unknown>(): Promise<ResponseJSON<T>>;
}

/** Per-statement execution options. */
export interface QueryOptions {
  /**
   * Hard cap on rows ClickHouse reads for this statement. Enforced server-side via
   * `max_result_rows` + `result_overflow_mode: 'break'`, so ClickHouse stops early
   * instead of streaming an unbounded result into the Node process (DL-009). This is
   * the real cap; the route's post-fetch slice is just belt-and-suspenders.
   */
  maxRows?: number;
}

/**
 * Narrow port over the ClickHouse client (ISP/DIP, DL-005): the query route depends
 * only on these two operations, which keeps it decoupled from the full client surface
 * and makes it trivial to mock in tests.
 */
export interface ClickHouseExecutor {
  /** Run a data-returning statement and return columns/rows/statistics as JSON. */
  query(sql: string, options?: QueryOptions): Promise<QueryResult>;
  /** Run a statement that returns no rows (DDL/DML/SET/...). */
  command(sql: string): Promise<{ query_id: string }>;
}

/** Builds an executor for a single request, forwarding that request's CH headers. */
export type ExecutorFactory = (headers: IncomingHttpHeaders) => ClickHouseExecutor;

/**
 * Forward `x-clickhouse-*` request headers (e.g. user/key/database) to ClickHouse,
 * collapsing any duplicated header values. Lifted from the original `index.ts`.
 */
export function extractClickHouseHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const key of Object.keys(headers)) {
    if (!key.startsWith('x-clickhouse-')) {
      continue;
    }
    const value = headers[key];
    if (value !== undefined) {
      forwarded[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  return forwarded;
}

/**
 * Production executor factory: creates a per-request ClickHouse client (so forwarded
 * auth headers are scoped to the request) and adapts it to the {@link ClickHouseExecutor} port.
 */
export const createClickHouseExecutor: ExecutorFactory = (headers) => {
  const client = createClient({
    url: CLICKHOUSE_URL,
    http_headers: extractClickHouseHeaders(headers),
  });

  return {
    query: (sql, options) =>
      client.query({
        query: sql,
        format: 'JSON',
        clickhouse_settings:
          options?.maxRows === undefined
            ? undefined
            : { max_result_rows: String(options.maxRows), result_overflow_mode: 'break' },
      }),
    command: (sql) => client.command({ query: sql }),
  };
};

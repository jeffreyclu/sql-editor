/**
 * Shared backend domain types for query execution.
 *
 * These shapes are the contract returned by `POST /query` (DL-004). The frontend
 * mirrors them in `web/src/api/types.ts`. Per-statement errors are part of the data
 * (HTTP 200); 4xx/5xx are reserved for malformed requests and server faults.
 */

/** A single result column: its name and ClickHouse type (from `meta`). */
export interface ColumnMeta {
  name: string;
  type: string;
}

/**
 * How a statement is executed:
 * - `query`   — data-returning (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN/EXISTS) → `client.query`
 * - `command` — everything else (DDL/DML/SET/...) → `client.command`
 */
export type StatementKind = 'query' | 'command';

/** Outcome of executing one statement. */
export type StatementStatus = 'success' | 'error';

/** The result of executing a single statement from a (possibly multi-statement) script. */
export interface StatementResult {
  /** The exact SQL that was executed (trimmed, comments preserved). */
  statement: string;
  kind: StatementKind;
  status: StatementStatus;

  /** Present for successful `query` statements. */
  columns?: ColumnMeta[];
  /** Returned rows, capped server-side (see `truncated`). */
  rows?: Record<string, unknown>[];
  /** Number of rows returned to the client (after any cap). */
  rowCount?: number;
  /** True when rows were capped at the server-side limit (DL-009). */
  truncated?: boolean;

  /** Server-reported execution time in milliseconds, when available. */
  elapsedMs?: number;
  /** ClickHouse query id, useful for tracing/cancellation. */
  queryId?: string;

  /** Present only when `status === 'error'`. */
  error?: { message: string };
}

/** Response body of `POST /query`: one entry per executed statement, in order. */
export interface RunResponse {
  statements: StatementResult[];
}

// --- Persistence (DL-013) -----------------------------------------------------

/**
 * One auto-logged run in the query history. Recorded on every `POST /query`
 * (success or failure); `status`/`error` summarize the run as a whole.
 */
export interface HistoryEntry {
  id: string;
  sql: string;
  /** ISO-8601 timestamp of when the run was recorded. */
  executedAt: string;
  status: StatementStatus;
  /** Number of statements the script was split into. */
  statementCount: number;
  /** Total server-reported execution time across statements, when available. */
  elapsedMs?: number;
  /** Message of the statement (or transport) error that ended the run, if any. */
  error?: string;
}

/** Fields needed to create a history entry; id/timestamp are assigned by the repository. */
export type NewHistoryEntry = Omit<HistoryEntry, 'id' | 'executedAt'>;

/** An explicit, named query the user saved for re-use. */
export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields to create a saved query; the rest are assigned by the repository. */
export type NewSavedQuery = Pick<SavedQuery, 'name' | 'sql'>;

/** Partial update for a saved query (rename and/or change SQL). */
export type SavedQueryUpdate = Partial<NewSavedQuery>;

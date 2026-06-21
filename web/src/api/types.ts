// Domain types for the query API. These mirror the backend `POST /query` response
// contract (DL-004) and are the single source of truth the UI renders against. The
// backend owns SQL execution; the frontend is purely presentational over these shapes.

export type StatementKind = 'query' | 'command';
export type StatementStatus = 'success' | 'error';

export interface ColumnMeta {
  name: string;
  type: string;
}

/** Result of executing a single statement within a (possibly multi-statement) script. */
export interface StatementResult {
  statement: string;
  kind: StatementKind;
  status: StatementStatus;
  /** Present for data-returning statements (`query`). */
  columns?: ColumnMeta[];
  /** Present for data-returning statements; capped server-side (DL-009). */
  rows?: Record<string, unknown>[];
  rowCount?: number;
  /** True when `rows` was capped at the server-side limit. */
  truncated?: boolean;
  elapsedMs?: number;
  queryId?: string;
  /** Present when `status === 'error'`. */
  error?: { message: string };
}

/** The `POST /query` response: per-statement results, executed in order (DL-004). */
export interface RunResponse {
  statements: StatementResult[];
}

export interface RunRequest {
  query: string;
  /** Internal reads (e.g. schema) set this `false` to skip history logging (DL-029). */
  recordHistory?: boolean;
}

/** An explicit, named query the user saved for re-use (DL-013). Mirrors the backend `SavedQuery`. */
export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields needed to create a saved query; the rest are assigned by the backend. */
export type NewSavedQuery = Pick<SavedQuery, 'name' | 'sql'>;

/** One auto-logged run in the query history (DL-013). Mirrors the backend `HistoryEntry`. */
export interface HistoryEntry {
  id: string;
  sql: string;
  /** ISO-8601 timestamp of when the run was recorded. */
  executedAt: string;
  status: StatementStatus;
  /** Number of statements the script was split into. */
  statementCount: number;
  elapsedMs?: number;
  /** Message of the error that ended the run, if any. */
  error?: string;
}

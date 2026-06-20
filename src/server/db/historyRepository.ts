import { randomUUID } from 'crypto';
import type { AppDatabase } from './db';
import type { HistoryEntry, NewHistoryEntry, StatementStatus } from '../types';

/**
 * Persistence port for the auto-logged query history (DL-013). Defined as an
 * interface so the route layer depends on the abstraction, not better-sqlite3 (DIP),
 * and so it can be exercised with an in-memory database in tests.
 */
export interface HistoryRepository {
  /** Most-recent-first, capped at `limit` (default 100). */
  list(limit?: number): HistoryEntry[];
  get(id: string): HistoryEntry | undefined;
  create(entry: NewHistoryEntry): HistoryEntry;
  /** @returns true if a row was removed. */
  delete(id: string): boolean;
  clear(): void;
}

/** Raw row shape (snake_case) as stored in SQLite. */
interface HistoryRow {
  id: string;
  sql: string;
  executed_at: string;
  status: string;
  statement_count: number;
  elapsed_ms: number | null;
  error: string | null;
}

function toEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    sql: row.sql,
    executedAt: row.executed_at,
    status: row.status as StatementStatus,
    statementCount: row.statement_count,
    elapsedMs: row.elapsed_ms ?? undefined,
    error: row.error ?? undefined,
  };
}

export function createHistoryRepository(db: AppDatabase): HistoryRepository {
  const insert = db.prepare(
    `INSERT INTO query_history (id, sql, executed_at, status, statement_count, elapsed_ms, error)
     VALUES (@id, @sql, @executed_at, @status, @statement_count, @elapsed_ms, @error)`,
  );
  // rowid tiebreak keeps insertion order stable when timestamps collide (fast test runs).
  const selectAll = db.prepare(
    `SELECT * FROM query_history ORDER BY executed_at DESC, rowid DESC LIMIT ?`,
  );
  const selectOne = db.prepare(`SELECT * FROM query_history WHERE id = ?`);
  const deleteOne = db.prepare(`DELETE FROM query_history WHERE id = ?`);
  const deleteAll = db.prepare(`DELETE FROM query_history`);

  return {
    list(limit = 100) {
      return (selectAll.all(limit) as HistoryRow[]).map(toEntry);
    },

    get(id) {
      const row = selectOne.get(id) as HistoryRow | undefined;
      return row ? toEntry(row) : undefined;
    },

    create(entry) {
      const row: HistoryRow = {
        id: randomUUID(),
        sql: entry.sql,
        executed_at: new Date().toISOString(),
        status: entry.status,
        statement_count: entry.statementCount,
        elapsed_ms: entry.elapsedMs ?? null,
        error: entry.error ?? null,
      };
      insert.run(row);
      return toEntry(row);
    },

    delete(id) {
      return deleteOne.run(id).changes > 0;
    },

    clear() {
      deleteAll.run();
    },
  };
}

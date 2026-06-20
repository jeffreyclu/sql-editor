import { randomUUID } from 'crypto';
import type { AppDatabase } from './db';
import type { NewSavedQuery, SavedQuery, SavedQueryUpdate } from '../types';

/**
 * Persistence port for explicit, named saved queries (DL-013). Interface-first so the
 * route layer depends on the abstraction (DIP) and tests can use an in-memory database.
 */
export interface SavedQueryRepository {
  /** Most-recently-updated first. */
  list(): SavedQuery[];
  get(id: string): SavedQuery | undefined;
  create(input: NewSavedQuery): SavedQuery;
  /** @returns the updated query, or undefined if no row with `id` exists. */
  update(id: string, input: SavedQueryUpdate): SavedQuery | undefined;
  /** @returns true if a row was removed. */
  delete(id: string): boolean;
}

/** Raw row shape (snake_case) as stored in SQLite. */
interface SavedQueryRow {
  id: string;
  name: string;
  sql: string;
  created_at: string;
  updated_at: string;
}

function toSavedQuery(row: SavedQueryRow): SavedQuery {
  return {
    id: row.id,
    name: row.name,
    sql: row.sql,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSavedQueryRepository(db: AppDatabase): SavedQueryRepository {
  const insert = db.prepare(
    `INSERT INTO saved_query (id, name, sql, created_at, updated_at)
     VALUES (@id, @name, @sql, @created_at, @updated_at)`,
  );
  const selectAll = db.prepare(`SELECT * FROM saved_query ORDER BY updated_at DESC, rowid DESC`);
  const selectOne = db.prepare(`SELECT * FROM saved_query WHERE id = ?`);
  const updateRow = db.prepare(
    `UPDATE saved_query SET name = @name, sql = @sql, updated_at = @updated_at WHERE id = @id`,
  );
  const deleteOne = db.prepare(`DELETE FROM saved_query WHERE id = ?`);

  const getRow = (id: string) => selectOne.get(id) as SavedQueryRow | undefined;

  return {
    list() {
      return (selectAll.all() as SavedQueryRow[]).map(toSavedQuery);
    },

    get(id) {
      const row = getRow(id);
      return row ? toSavedQuery(row) : undefined;
    },

    create(input) {
      const now = new Date().toISOString();
      const row: SavedQueryRow = {
        id: randomUUID(),
        name: input.name,
        sql: input.sql,
        created_at: now,
        updated_at: now,
      };
      insert.run(row);
      return toSavedQuery(row);
    },

    update(id, input) {
      const existing = getRow(id);
      if (!existing) {
        return undefined;
      }
      const updated: SavedQueryRow = {
        ...existing,
        name: input.name ?? existing.name,
        sql: input.sql ?? existing.sql,
        updated_at: new Date().toISOString(),
      };
      updateRow.run(updated);
      return toSavedQuery(updated);
    },

    delete(id) {
      return deleteOne.run(id).changes > 0;
    },
  };
}

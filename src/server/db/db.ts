import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Schema for the two persistence tables (DL-013), with distinct lifecycles:
 * - `query_history` — auto-logged on every run (success or error).
 * - `saved_query`   — explicit, named queries the user keeps for re-use.
 *
 * `IF NOT EXISTS` makes this an idempotent migration run on every boot.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS query_history (
  id              TEXT PRIMARY KEY,
  sql             TEXT NOT NULL,
  executed_at     TEXT NOT NULL,
  status          TEXT NOT NULL,
  statement_count INTEGER NOT NULL,
  elapsed_ms      INTEGER,
  error           TEXT
);

CREATE TABLE IF NOT EXISTS saved_query (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sql         TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
`;

export type AppDatabase = Database.Database;

/**
 * Open (and migrate) the SQLite database. Pass `:memory:` for an isolated in-memory
 * database — used by tests and as the default so the app never silently writes a file.
 * For a file path, parent directories are created and WAL mode is enabled for better
 * concurrent read/write behaviour.
 */
export function createDatabase(filename = ':memory:'): AppDatabase {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  if (filename !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.exec(SCHEMA);

  return db;
}

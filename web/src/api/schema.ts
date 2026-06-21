import { apiClient } from './apiClient';
import { ApiError } from './apiClient';

// Schema metadata for the explorer panel + autocomplete (DL-025). There is NO dedicated backend
// endpoint: we reuse the existing `POST /query` (DL-025) to read `system.columns`, then transform
// the flat rows into a database → table → columns tree. Fetched/cached once via `useSchema`
// (TanStack `useQuery`, DL-020) and shared by both consumers.

/** TanStack query key for the schema (DL-020). Long-lived; schema changes rarely. */
export const SCHEMA_QUERY_KEY = ['schema'] as const;

/** A single column within a table. */
export interface SchemaColumn {
  name: string;
  type: string;
}

/** A table and its columns. */
export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
}

/** A database and its tables. */
export interface SchemaDatabase {
  name: string;
  tables: SchemaTable[];
}

/** The schema tree: databases → tables → columns. */
export type SchemaTree = SchemaDatabase[];

// One row per column from `system.columns` (we alias `name AS column` to avoid the reserved word).
const SCHEMA_SQL =
  "SELECT database, table, name AS column, type FROM system.columns " +
  "WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA') " +
  'ORDER BY database, table, column';

interface SchemaRow {
  database: string;
  table: string;
  column: string;
  type: string;
}

/**
 * Fetch the schema via the existing `POST /query` (DL-025) and shape it into a tree.
 * The first (only) statement's `rows` are the flat `system.columns` rows.
 */
export async function fetchSchema(signal?: AbortSignal): Promise<SchemaTree> {
  // Internal read — opt out of history logging so the schema query doesn't pollute the user's
  // run history (DL-029).
  const response = await apiClient.runQuery(SCHEMA_SQL, signal, { recordHistory: false });
  const statement = response.statements[0];
  if (statement?.status === 'error') {
    throw new ApiError(statement.error?.message ?? 'Failed to load schema');
  }
  return rowsToTree(statement?.rows ?? []);
}

/**
 * Transform flat `{ database, table, column, type }` rows into a `database → table → columns` tree.
 * Rows are assumed ordered (the query sorts them), but we group defensively so order isn't relied on.
 */
export function rowsToTree(rows: ReadonlyArray<Record<string, unknown>>): SchemaTree {
  const databases = new Map<string, Map<string, SchemaColumn[]>>();

  for (const raw of rows) {
    const row = raw as Partial<SchemaRow>;
    const database = typeof row.database === 'string' ? row.database : '';
    const table = typeof row.table === 'string' ? row.table : '';
    const column = typeof row.column === 'string' ? row.column : '';
    if (!database || !table || !column) {
      continue;
    }
    const type = typeof row.type === 'string' ? row.type : '';

    let tables = databases.get(database);
    if (!tables) {
      tables = new Map<string, SchemaColumn[]>();
      databases.set(database, tables);
    }
    let columns = tables.get(table);
    if (!columns) {
      columns = [];
      tables.set(table, columns);
    }
    columns.push({ name: column, type });
  }

  return [...databases.entries()].map(([name, tables]) => ({
    name,
    tables: [...tables.entries()].map(([tableName, columns]) => ({ name: tableName, columns })),
  }));
}

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import type { DataFormat } from '@clickhouse/client';
import type { ExecutorFactory } from '../clickhouse';

/** Default cap on uploaded file size; bounds memory since the file is buffered (DL-006). */
export const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

/** Input formats we accept for import — a whitelist so an arbitrary string can't reach CH. */
const ALLOWED_FORMATS = new Set<DataFormat>([
  'CSV',
  'CSVWithNames',
  'TabSeparated',
  'TabSeparatedWithNames',
  'JSONEachRow',
]);
const DEFAULT_FORMAT: DataFormat = 'CSVWithNames';

/**
 * An (optionally database-qualified) unquoted ClickHouse identifier, e.g. `events` or
 * `analytics.events`. Validated up front so a bad name returns a clear 400 instead of a
 * confusing ClickHouse parse error (review R3). Not a security control — `/query` already
 * runs arbitrary SQL under the same credentials.
 */
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

/**
 * Column names inferred from the first line of an uploaded file, used to create a new target
 * table on import (DL-033). Name-bearing formats (`…WithNames` / `JSONEachRow`) carry real
 * names; for the headerless formats we synthesise `c1..cN` from the first row's field count.
 * Returns `[]` when nothing can be inferred (empty file / unparseable first line).
 */
export function inferColumnNames(buffer: Buffer, format: DataFormat): string[] {
  const line = firstLine(buffer).trim();
  if (!line) {
    return [];
  }
  if (format === 'JSONEachRow') {
    try {
      const parsed: unknown = JSON.parse(line);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.keys(parsed as Record<string, unknown>)
        : [];
    } catch {
      return [];
    }
  }
  const isTab = format === 'TabSeparated' || format === 'TabSeparatedWithNames';
  const cells = isTab ? line.split('\t') : parseCsvHeader(line);
  const hasNames = format === 'CSVWithNames' || format === 'TabSeparatedWithNames';
  // Named formats use the header cells (falling back to a positional name for any blank cell so the
  // column count still lines up); headerless formats are named purely by position.
  return cells.map((cell, index) => (hasNames ? cell.trim() || `c${index + 1}` : `c${index + 1}`));
}

/** First line of a buffer (without the trailing CR), decoding only up to the first newline. */
function firstLine(buffer: Buffer): string {
  const newline = buffer.indexOf(0x0a);
  const slice = newline === -1 ? buffer : buffer.subarray(0, newline);
  return slice.toString('utf8').replace(/\r$/, '');
}

/** Split a single CSV line into fields, honouring quotes and `""` escapes (matches CH's CSV). */
function parseCsvHeader(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * DDL to create the import target as a `Nullable(String)` table (DL-033). All-String keeps creation
 * deterministic — no fragile type inference — and accepts any value the file holds; the user can
 * re-type columns later. Column identifiers are backtick-quoted; the table name is pre-validated.
 */
function buildCreateTableSql(table: string, columns: string[]): string {
  const defs = columns.map((name) => `${quoteIdentifier(name)} Nullable(String)`).join(', ');
  return `CREATE TABLE IF NOT EXISTS ${table} (${defs}) ENGINE = MergeTree ORDER BY tuple()`;
}

function quoteIdentifier(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

export interface ImportRouteDeps {
  /** Builds a ClickHouse executor for a request (injected for testability — DIP). */
  createExecutor: ExecutorFactory;
  /** Max accepted upload size in bytes. Defaults to {@link DEFAULT_MAX_UPLOAD_BYTES}. */
  maxBytes?: number;
}

/**
 * `POST /import` — stream an uploaded file's rows into an existing ClickHouse table
 * (DL-006; backend half of the future `fileImportPlugin`).
 *
 * Multipart form fields: `file` (the upload), `table` (target), optional `format`
 * (defaults to `CSVWithNames`), and optional `createTable` (`'true'` to create the target first).
 * When `createTable` is set the table is created with `Nullable(String)` columns inferred from the
 * file's header before the insert (DL-033); otherwise the table must already exist.
 *
 * Responds 200 `{ table, format, rowsWritten?, queryId }`; 400 for a bad request or a
 * rejected insert (e.g. unknown table / malformed rows); 413 when the file exceeds the cap.
 */
export function createImportRouter({
  createExecutor,
  maxBytes = DEFAULT_MAX_UPLOAD_BYTES,
}: ImportRouteDeps): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes } });

  router.post('/', (req, res, next) => {
    // Run multer manually so its errors return the JSON `{ error }` contract, not HTML.
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const tooLarge = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
        res.status(tooLarge ? 413 : 400).json({
          error: err instanceof Error ? err.message : 'File upload failed',
        });
        return;
      }
      handleImport(req, res, createExecutor).catch(next);
    });
  });

  return router;
}

async function handleImport(
  req: Request,
  res: Response,
  createExecutor: ExecutorFactory,
): Promise<void> {
  const { file } = req;
  const body = (req.body ?? {}) as { table?: unknown; format?: unknown; createTable?: unknown };
  const table = typeof body.table === 'string' ? body.table.trim() : '';
  const format = typeof body.format === 'string' && body.format ? (body.format as DataFormat) : DEFAULT_FORMAT;
  // Multipart text fields arrive as strings; treat the literal 'true' as opt-in.
  const createTable = body.createTable === 'true' || body.createTable === true;

  if (!file) {
    res.status(400).json({ error: "'file' is required" });
    return;
  }
  if (!table) {
    res.status(400).json({ error: "'table' is required" });
    return;
  }
  if (!TABLE_NAME.test(table)) {
    res.status(400).json({ error: `invalid table name '${table}'` });
    return;
  }
  if (!ALLOWED_FORMATS.has(format)) {
    res.status(400).json({ error: `unsupported format '${format}'` });
    return;
  }

  const executor = createExecutor(req.headers);
  try {
    if (createTable) {
      const columns = inferColumnNames(file.buffer, format);
      if (columns.length === 0) {
        res.status(400).json({ error: 'could not infer columns from the file to create the table' });
        return;
      }
      // CREATE before the insert; `IF NOT EXISTS` keeps it idempotent if the table already exists.
      await executor.command(buildCreateTableSql(table, columns));
    }
    // Wrap the buffer as a single-chunk byte stream (objectMode: false) — the ClickHouse
    // client rejects object-mode streams for raw formats.
    const values = Readable.from([file.buffer], { objectMode: false });
    const result = await executor.insert({ table, values, format });
    res.status(200).json({
      table,
      format,
      rowsWritten: result.rowsWritten,
      queryId: result.query_id,
      created: createTable,
    });
  } catch (error) {
    // Insert rejected (unknown table, type mismatch, malformed rows, ...) — treat as bad input.
    res.status(400).json({ error: error instanceof Error ? error.message : 'Import failed' });
  }
}

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
 * (defaults to `CSVWithNames`). The table must already exist — schema inference / table
 * creation is out of scope for this slice.
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
  const body = (req.body ?? {}) as { table?: unknown; format?: unknown };
  const table = typeof body.table === 'string' ? body.table.trim() : '';
  const format = typeof body.format === 'string' && body.format ? (body.format as DataFormat) : DEFAULT_FORMAT;

  if (!file) {
    res.status(400).json({ error: "'file' is required" });
    return;
  }
  if (!table) {
    res.status(400).json({ error: "'table' is required" });
    return;
  }
  if (!ALLOWED_FORMATS.has(format)) {
    res.status(400).json({ error: `unsupported format '${format}'` });
    return;
  }

  const executor = createExecutor(req.headers);
  try {
    // Wrap the buffer as a single-chunk byte stream (objectMode: false) — the ClickHouse
    // client rejects object-mode streams for raw formats.
    const values = Readable.from([file.buffer], { objectMode: false });
    const result = await executor.insert({ table, values, format });
    res.status(200).json({
      table,
      format,
      rowsWritten: result.rowsWritten,
      queryId: result.query_id,
    });
  } catch (error) {
    // Insert rejected (unknown table, type mismatch, malformed rows, ...) — treat as bad input.
    res.status(400).json({ error: error instanceof Error ? error.message : 'Import failed' });
  }
}

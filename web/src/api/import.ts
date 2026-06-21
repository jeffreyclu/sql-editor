import { ApiError } from './apiClient';

// Thin typed fetch fn for the file-import feature (DL-006 / DL-020). The backend half is
// `POST /import` (multipart/form-data); TanStack `useMutation` wraps this in `useImportFile`.
// No React here — this is the framework-agnostic service edge (DL-005).

/** Input formats `POST /import` accepts — a whitelist mirrored from the backend (`import.ts`). */
export const IMPORT_FORMATS = [
  'CSVWithNames',
  'CSV',
  'TabSeparatedWithNames',
  'TabSeparated',
  'JSONEachRow',
] as const;

export type ImportFormat = (typeof IMPORT_FORMATS)[number];

/**
 * Best-effort import format from a file's name — used to pre-select the Format control when a
 * file is chosen, so the common case needs no manual pick. It is only a *default*: the extension
 * can't tell us whether a CSV/TSV carries a header row (`CSV` vs `CSVWithNames`), and we lean
 * toward the with-names variants because most exported files have headers. Returns `null` for
 * extensions we can't map (e.g. `.txt`), so the caller keeps the current selection rather than
 * guessing. The Format dropdown stays editable so the user can correct any of this.
 */
export function formatForFileName(fileName: string): ImportFormat | null {
  const name = fileName.toLowerCase();
  if (name.endsWith('.tsv') || name.endsWith('.tab')) {
    return 'TabSeparatedWithNames';
  }
  if (name.endsWith('.ndjson') || name.endsWith('.json')) {
    return 'JSONEachRow';
  }
  if (name.endsWith('.csv')) {
    return 'CSVWithNames';
  }
  return null;
}

/** Arguments for an import: the file to upload, the target table, and an optional format. */
export interface ImportFileInput {
  file: File;
  table: string;
  /** Defaults to `CSVWithNames` server-side when omitted (matches the backend default). */
  format?: ImportFormat;
  /** Create the target first, with `Nullable(String)` columns inferred from the header (DL-033). */
  createTable?: boolean;
}

/** The `POST /import` success body (200) — mirrors the backend contract (review R3). */
export interface ImportResult {
  table: string;
  format: string;
  /** Rows the server reports as written; ClickHouse doesn't always provide it. */
  rowsWritten?: number;
  queryId: string;
  /** True when the server created the target table as part of this import (DL-033). */
  created?: boolean;
}

/** Stream an uploaded file into an existing ClickHouse table (`POST /import`). */
export async function importFile({
  file,
  table,
  format,
  createTable,
}: ImportFileInput): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('table', table);
  if (format) {
    form.append('format', format);
  }
  if (createTable) {
    form.append('createTable', 'true');
  }

  // No explicit Content-Type header: the browser sets `multipart/form-data` with the boundary.
  const response = await fetch('/import', { method: 'POST', body: form });
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as ImportResult;
}

/** The backend sends `{ error: string }` for 4xx/5xx (review R3); fall back to a status line. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return `Request failed with status ${response.status}`;
}

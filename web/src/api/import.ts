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

/** Arguments for an import: the file to upload, the target table, and an optional format. */
export interface ImportFileInput {
  file: File;
  table: string;
  /** Defaults to `CSVWithNames` server-side when omitted (matches the backend default). */
  format?: ImportFormat;
}

/** The `POST /import` success body (200) — mirrors the backend contract (review R3). */
export interface ImportResult {
  table: string;
  format: string;
  /** Rows the server reports as written; ClickHouse doesn't always provide it. */
  rowsWritten?: number;
  queryId: string;
}

/** Stream an uploaded file into an existing ClickHouse table (`POST /import`). */
export async function importFile({ file, table, format }: ImportFileInput): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('table', table);
  if (format) {
    form.append('format', format);
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

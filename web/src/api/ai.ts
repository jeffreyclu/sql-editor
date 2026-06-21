import { ApiError } from './apiClient';
import type { SchemaTree } from './schema';

// Thin typed fetch fn for the AI assistant (NL→SQL) feature (DL-031). The backend half is a
// server-side LLM proxy at `POST /api/ai/sql` (the API key never touches the browser — DL-031/DL-032);
// TanStack `useMutation` wraps this in `useGenerateSql`. No React here — this is the
// framework-agnostic service edge (DL-005).

/** Arguments for a generation request: the natural-language prompt and the cached schema tree. */
export interface GenerateSqlInput {
  prompt: string;
  /**
   * The cached `SchemaTree` (databases → tables → columns) from `useSchema` (DL-025), sent as-is so
   * the backend can embed it in the prompt and generate SQL that targets real tables/columns.
   */
  schema?: SchemaTree;
}

/** The `POST /api/ai/sql` success body (200) — mirrors the backend contract (DL-031). */
export interface AiSqlResult {
  sql: string;
  /** A short natural-language explanation of the generated query, when the model provides one. */
  explanation?: string;
}

/**
 * Generate SQL from a natural-language prompt (`POST /api/ai/sql`). Sends `{ prompt, schema }` and
 * returns `{ sql, explanation? }`. Throws an `ApiError` (carrying the backend `{ error }` message and
 * status) on a non-2xx response — e.g. 503 when the server has no API key configured (DL-031).
 */
export async function generateSql({ prompt, schema }: GenerateSqlInput): Promise<AiSqlResult> {
  const response = await fetch('/api/ai/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, schema }),
  });
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as AiSqlResult;
}

/** The backend sends `{ error: string }` for 4xx/5xx (DL-031); fall back to a status line. */
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

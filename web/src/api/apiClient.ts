import type { RunResponse } from './types';

// The service layer: a framework-agnostic typed wrapper over the backend HTTP API. No React
// here (DL-005). It's exposed as an interface so it can be injected/mocked in tests (DIP).
export interface ApiClient {
  runQuery(query: string, signal?: AbortSignal): Promise<RunResponse>;
}

/**
 * A transport- or server-level failure (network error, 4xx/5xx). This is distinct from a
 * per-statement SQL error, which the backend returns as *data* inside a 200 `RunResponse`
 * (DL-004). The UI surfaces the two differently.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function runQuery(query: string, signal?: AbortSignal): Promise<RunResponse> {
  const response = await fetch('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as RunResponse;
}

/** The backend sends `{ error: string }` for 4xx/5xx (DL-004); fall back to a status line. */
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

/** Production client, wired to the same-origin `/query` endpoint (proxied to Express in dev). */
export const apiClient: ApiClient = { runQuery };

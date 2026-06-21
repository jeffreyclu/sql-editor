import { ApiError } from './apiClient';
import type { NewSavedQuery, SavedQuery } from './types';

// TanStack query key for saved queries (DL-020). The save/delete mutations invalidate it.
export const SAVED_QUERIES_QUERY_KEY = ['savedQueries'] as const;

/** List saved queries, most-recently-updated first (`GET /api/queries`). */
export async function fetchSavedQueries(signal?: AbortSignal): Promise<SavedQuery[]> {
  const response = await fetch('/api/queries', { signal });
  if (!response.ok) {
    throw new ApiError(`Failed to load saved queries (${response.status})`, response.status);
  }
  return (await response.json()) as SavedQuery[];
}

/** Create a saved query (`POST /api/queries`). */
export async function createSavedQuery(input: NewSavedQuery): Promise<SavedQuery> {
  const response = await fetch('/api/queries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as SavedQuery;
}

/** Update a saved query's name and/or SQL (`PUT /api/queries/:id`); returns the updated record. */
export async function updateSavedQuery(
  id: string,
  changes: Partial<NewSavedQuery>,
): Promise<SavedQuery> {
  const response = await fetch(`/api/queries/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as SavedQuery;
}

/** Delete a saved query (`DELETE /api/queries/:id`). */
export async function deleteSavedQuery(id: string): Promise<void> {
  const response = await fetch(`/api/queries/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new ApiError(`Failed to delete saved query (${response.status})`, response.status);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // non-JSON body
  }
  return `Request failed with status ${response.status}`;
}

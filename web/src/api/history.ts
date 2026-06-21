import { ApiError } from './apiClient';
import type { HistoryEntry } from './types';

// TanStack query key for the run history (DL-020). Shared by the `useHistory` query and the run
// mutation (which invalidates it after each run).
export const HISTORY_QUERY_KEY = ['history'] as const;

/** Fetch the auto-logged run history, most recent first (`GET /api/history`). */
export async function fetchHistory(signal?: AbortSignal): Promise<HistoryEntry[]> {
  const response = await fetch('/api/history', { signal });
  if (!response.ok) {
    throw new ApiError(`Failed to load history (${response.status})`, response.status);
  }
  return (await response.json()) as HistoryEntry[];
}

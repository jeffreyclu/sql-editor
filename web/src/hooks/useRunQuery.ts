import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RunResponse } from '../api/types';
import { ApiError, apiClient as defaultApiClient, type ApiClient } from '../api/apiClient';
import { HISTORY_QUERY_KEY } from '../api/history';

// Running a query is imperative, uncached server state, so it's a TanStack Query **mutation**
// (DL-020): `useMutation` already models idle/pending/success/error. Results are never cached
// (freshness — DL-014). Mutations have no built-in AbortSignal, so we add an `AbortController`
// for cancellation + supersede. We expose a small `RunState` union so the presentational results
// components stay decoupled from TanStack.
export type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; data: RunResponse }
  | { status: 'error'; message: string }; // transport/parse failure, not a SQL error

export interface RunQuery {
  runState: RunState;
  run: (query: string) => void;
  cancel: () => void;
}

export function useRunQuery(apiClient: ApiClient = defaultApiClient): RunQuery {
  const queryClient = useQueryClient();
  const controllerRef = useRef<AbortController | null>(null);

  const { mutate, reset, status, data, error } = useMutation<RunResponse, unknown, string>({
    mutationFn: (query) => {
      controllerRef.current?.abort(); // supersede any in-flight run
      const controller = new AbortController();
      controllerRef.current = controller;
      return apiClient.runQuery(query, controller.signal);
    },
    // Every run is auto-logged to history server-side, so refresh the history query (DL-020).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  });

  const run = useCallback((query: string) => mutate(query), [mutate]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    reset(); // detaches the observer, so the aborted request's rejection is ignored
  }, [reset]);

  const runState = useMemo<RunState>(() => {
    switch (status) {
      case 'pending':
        return { status: 'running' };
      case 'success':
        return data ? { status: 'done', data } : { status: 'idle' };
      case 'error':
        return { status: 'error', message: toMessage(error) };
      default:
        return { status: 'idle' };
    }
  }, [status, data, error]);

  return { runState, run, cancel };
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return 'Request failed';
}

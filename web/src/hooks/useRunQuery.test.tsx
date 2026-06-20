import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useRunQuery } from './useRunQuery';
import type { ApiClient } from '../api/apiClient';
import type { RunResponse } from '../api/types';

const response: RunResponse = {
  statements: [
    {
      statement: 'SELECT 1',
      kind: 'query',
      status: 'success',
      columns: [{ name: '1', type: 'UInt8' }],
      rows: [{ '1': 1 }],
      rowCount: 1,
    },
  ],
};

/** A fresh QueryClient per test keeps mutation state isolated; mutations don't retry. */
function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** A client whose request hangs until the AbortSignal fires, then rejects with AbortError. */
function abortableClient(): ApiClient {
  return {
    runQuery: vi.fn(
      (_query, signal) =>
        new Promise<RunResponse>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    ),
  };
}

describe('useRunQuery', () => {
  it('transitions idle → running → done', async () => {
    let resolveRun!: (value: RunResponse) => void;
    const client: ApiClient = {
      runQuery: vi.fn(() => new Promise<RunResponse>((resolve) => (resolveRun = resolve))),
    };
    const { result } = renderHook(() => useRunQuery(client), { wrapper: makeWrapper() });

    expect(result.current.runState.status).toBe('idle');

    act(() => {
      result.current.run('SELECT 1');
    });
    await waitFor(() => expect(result.current.runState.status).toBe('running'));

    resolveRun(response);
    await waitFor(() =>
      expect(result.current.runState).toEqual({ status: 'done', data: response }),
    );
  });

  it('transitions to error on transport failure', async () => {
    const client: ApiClient = { runQuery: vi.fn(() => Promise.reject(new Error('boom'))) };
    const { result } = renderHook(() => useRunQuery(client), { wrapper: makeWrapper() });

    act(() => {
      result.current.run('SELECT 1');
    });

    await waitFor(() =>
      expect(result.current.runState).toEqual({ status: 'error', message: 'boom' }),
    );
  });

  it('cancel aborts the in-flight run and returns to idle', async () => {
    const { result } = renderHook(() => useRunQuery(abortableClient()), { wrapper: makeWrapper() });

    act(() => {
      result.current.run('SELECT 1');
    });
    await waitFor(() => expect(result.current.runState.status).toBe('running'));

    act(() => {
      result.current.cancel();
    });
    await waitFor(() => expect(result.current.runState.status).toBe('idle'));
  });

  it('a superseding run ignores the aborted prior run and ends on the latest result', async () => {
    const client: ApiClient = {
      runQuery: vi
        .fn()
        .mockImplementationOnce(
          (_query, signal) =>
            new Promise<RunResponse>((_resolve, reject) => {
              signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              );
            }),
        )
        .mockImplementationOnce(() => Promise.resolve(response)),
    };
    const { result } = renderHook(() => useRunQuery(client), { wrapper: makeWrapper() });

    act(() => {
      result.current.run('SELECT 1');
    });
    await waitFor(() => expect(result.current.runState.status).toBe('running'));

    act(() => {
      result.current.run('SELECT 2');
    });
    await waitFor(() =>
      expect(result.current.runState).toEqual({ status: 'done', data: response }),
    );
  });
});

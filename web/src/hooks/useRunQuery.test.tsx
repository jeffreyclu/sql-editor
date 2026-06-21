import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useRunQuery } from './useRunQuery';
import type { ApiClient } from '../api/apiClient';
import type { RunResponse } from '../api/types';
import { SCHEMA_QUERY_KEY } from '../api/schema';

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

  it('refreshes the schema after a DDL run, but not after a plain SELECT', async () => {
    const ddl: RunResponse = {
      statements: [{ statement: 'DROP TABLE t', kind: 'command', status: 'success' }],
    };

    // DDL run → schema query invalidated.
    const ddlClient: ApiClient = { runQuery: vi.fn(() => Promise.resolve(ddl)) };
    const ddlQc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const ddlSpy = vi.spyOn(ddlQc, 'invalidateQueries');
    const ddlWrap = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={ddlQc}>{children}</QueryClientProvider>
    );
    const { result: ddlResult } = renderHook(() => useRunQuery(ddlClient), { wrapper: ddlWrap });
    act(() => ddlResult.current.run('DROP TABLE t'));
    await waitFor(() => expect(ddlResult.current.runState.status).toBe('done'));
    expect(ddlSpy).toHaveBeenCalledWith({ queryKey: SCHEMA_QUERY_KEY });

    // SELECT run → schema query NOT invalidated.
    const selClient: ApiClient = { runQuery: vi.fn(() => Promise.resolve(response)) };
    const selQc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const selSpy = vi.spyOn(selQc, 'invalidateQueries');
    const selWrap = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={selQc}>{children}</QueryClientProvider>
    );
    const { result: selResult } = renderHook(() => useRunQuery(selClient), { wrapper: selWrap });
    act(() => selResult.current.run('SELECT 1'));
    await waitFor(() => expect(selResult.current.runState.status).toBe('done'));
    expect(selSpy).not.toHaveBeenCalledWith({ queryKey: SCHEMA_QUERY_KEY });
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

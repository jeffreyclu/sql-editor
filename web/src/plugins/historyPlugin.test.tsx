import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { historyPlugin } from './historyPlugin';
import type { HistoryEntry } from '../api/types';

const entries: HistoryEntry[] = [
  {
    id: '1',
    sql: 'SELECT 1;',
    executedAt: '2026-06-20T10:00:00.000Z',
    status: 'success',
    statementCount: 1,
  },
  {
    id: '2',
    sql: 'SELECT bad;',
    executedAt: '2026-06-20T10:01:00.000Z',
    status: 'error',
    statementCount: 1,
    error: 'boom',
  },
];

afterEach(() => vi.unstubAllGlobals());

function renderHistory(setDoc: (doc: string) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ClickUIProvider theme="light">
      <QueryClientProvider client={queryClient}>
        {historyPlugin.renderPanel({ setDoc, run: vi.fn() }, () => {})}
      </QueryClientProvider>
    </ClickUIProvider>,
  );
}

describe('historyPlugin', () => {
  it('lists runs and loads one back into the editor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => entries }));
    const setDoc = vi.fn();
    renderHistory(setDoc);

    // Wait for the query to resolve, then click the first run's card (via its SQL preview).
    fireEvent.click(await screen.findByText('SELECT 1;'));

    expect(setDoc).toHaveBeenCalledWith('SELECT 1;');
  });
});

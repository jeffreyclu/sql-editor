import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { QueryProvider, useQuery } from '../state/QueryProvider';
import { ResultsPanel } from './ResultsPanel';
import type { ApiClient } from '../api/apiClient';
import type { RunResponse } from '../api/types';

// One critical UI path (DL-015): trigger a run and assert the results grid renders. This wires
// QueryProvider + useQuery + ResultsPanel + ResultTable + Click UI Table together with a mocked
// client (the editor/CodeMirror is exercised separately to keep this fast and stable).
const response: RunResponse = {
  statements: [
    {
      statement: 'SELECT 7 AS n',
      kind: 'query',
      status: 'success',
      columns: [{ name: 'n', type: 'UInt8' }],
      rows: [{ n: 7 }],
      rowCount: 1,
    },
  ],
};

function Harness() {
  const { run, runState } = useQuery();
  return (
    <div>
      <button type="button" onClick={() => run('SELECT 7 AS n')}>
        run
      </button>
      <ResultsPanel state={runState} />
    </div>
  );
}

function renderHarness(client: ApiClient) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <ClickUIProvider theme="light">
      <QueryClientProvider client={queryClient}>
        <QueryProvider apiClient={client}>
          <Harness />
        </QueryProvider>
      </QueryClientProvider>
    </ClickUIProvider>,
  );
}

describe('run → results UI path', () => {
  it('renders the result table after running', async () => {
    const client: ApiClient = { runQuery: vi.fn().mockResolvedValue(response) };
    renderHarness(client);

    expect(screen.getByText('Run a query to see results here.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'run' }));

    expect(await screen.findByText('7')).toBeInTheDocument();
    // Click UI's Table renders the column label in both its desktop and responsive layouts.
    expect(screen.getAllByText('n').length).toBeGreaterThan(0); // column header name
  });

  it('shows a transport error banner when the request fails', async () => {
    const client: ApiClient = { runQuery: vi.fn().mockRejectedValue(new Error('network down')) };
    renderHarness(client);

    await userEvent.click(screen.getByRole('button', { name: 'run' }));

    expect(await screen.findByText('network down')).toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { schemaPlugin } from './schemaPlugin';
import type { PluginContext } from './types';
import type { RunResponse } from '../api/types';

// `fetchSchema` runs `POST /query` (via apiClient) against system.columns; the rows are the flat
// schema. Mocking `fetch` (as the other plugin tests do) exercises the real fetch → transform path.
const schemaResponse: RunResponse = {
  statements: [
    {
      statement: 'SELECT … FROM system.columns',
      kind: 'query',
      status: 'success',
      columns: [
        { name: 'database', type: 'String' },
        { name: 'table', type: 'String' },
        { name: 'column', type: 'String' },
        { name: 'type', type: 'String' },
      ],
      rows: [
        { database: 'shop', table: 'orders', column: 'id', type: 'UInt64' },
        { database: 'shop', table: 'orders', column: 'total', type: 'Decimal(10, 2)' },
      ],
      rowCount: 2,
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

function renderSchema(ctx: PluginContext) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ClickUIProvider theme="light">
      <QueryClientProvider client={queryClient}>
        {schemaPlugin.renderPanel(ctx, () => {})}
      </QueryClientProvider>
    </ClickUIProvider>,
  );
}

describe('schemaPlugin', () => {
  it('lists databases/tables and inserts a table name into the editor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => schemaResponse }),
    );
    const setDoc = vi.fn();
    renderSchema({ setDoc, getDoc: () => 'SELECT * FROM', run: vi.fn() });

    // The database accordion renders collapsed once the query resolves; expand it to reveal tables.
    fireEvent.click(await screen.findByText('shop'));

    // Insert the table name; getDoc returns a non-empty doc, so it's appended with a space.
    fireEvent.click(screen.getByTitle('Insert orders'));
    expect(setDoc).toHaveBeenCalledWith('SELECT * FROM orders');
  });
});

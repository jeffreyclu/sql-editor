import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { fileImportPlugin } from './fileImportPlugin';
import { SCHEMA_QUERY_KEY, type SchemaTree } from '../api/schema';
import type { PluginContext } from './types';

afterEach(() => vi.unstubAllGlobals());

const ctx: PluginContext = { setDoc: vi.fn(), getDoc: () => '', run: vi.fn() };

// One database with one table, seeded straight into the query cache so the table dropdown is
// populated without a schema round-trip (the schema fetch/transform path is covered separately
// in schema.test.ts / schemaPlugin.test.tsx).
const schemaTree: SchemaTree = [{ name: 'default', tables: [{ name: 'events', columns: [] }] }];

function renderPanel(tree: SchemaTree = schemaTree) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(SCHEMA_QUERY_KEY, tree);
  return render(
    <ClickUIProvider theme="light">
      <QueryClientProvider client={queryClient}>
        {fileImportPlugin.renderPanel(ctx, () => {})}
      </QueryClientProvider>
    </ClickUIProvider>,
  );
}

describe('fileImportPlugin', () => {
  it('is a left-placed plugin with an Import label and a valid upload icon', () => {
    expect(fileImportPlugin.id).toBe('import');
    expect(fileImportPlugin.toolbarLabel).toBe('Import');
    expect(fileImportPlugin.icon).toBe('upload');
    expect(fileImportPlugin.placement).toBe('left');
  });

  it('picks a schema table, derives the format from the file extension, and POSTs FormData', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        table: 'default.events',
        format: 'JSONEachRow',
        rowsWritten: 5,
        queryId: 'q1',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = renderPanel();

    const importButton = screen.getByRole('button', { name: /^import$/i });
    expect(importButton).toBeDisabled();

    // The Click UI FileUpload renders a hidden <input type="file">; fire a change on it. A .ndjson
    // file should auto-select the JSONEachRow format (no manual pick needed).
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(['{"id":1}\n'], 'rows.ndjson', { type: 'application/x-ndjson' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Still disabled until a table is chosen.
    expect(importButton).toBeDisabled();

    // Open the table dropdown (sourced from the seeded schema) and pick the table.
    await userEvent.click(screen.getByText('Select or type a new table'));
    await userEvent.click(await screen.findByText('default.events'));

    await waitFor(() => expect(importButton).not.toBeDisabled());
    // fireEvent (not userEvent) so the click dispatches straight on the button — the just-closed
    // Select's portal can otherwise intercept userEvent's realistic hit-testing in jsdom.
    fireEvent.click(importButton);

    // Find the import POST specifically — a successful import also refetches the schema (the
    // useImportFile success invalidation), so it isn't the only fetch.
    const importCall = await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url === '/import');
      expect(call).toBeTruthy();
      return call as [string, RequestInit];
    });
    const [, options] = importCall;
    expect(options.method).toBe('POST');
    const body = options.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('table')).toBe('default.events');
    expect(body.get('format')).toBe('JSONEachRow');
    expect(body.get('file')).toBeInstanceOf(File);
    // An existing table is not created.
    expect(body.get('createTable')).toBeNull();

    // On success the upload area resets to its empty state (the "Drop a file or browse" prompt
    // reappears) rather than lingering on the imported file in an error/retry state.
    expect(await screen.findByText('Drop a file or browse')).toBeInTheDocument();
  });

  it('still offers the table picker (to create one) when the schema has no tables', () => {
    renderPanel([]);
    expect(screen.getByText('Select or type a new table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled();
  });
});

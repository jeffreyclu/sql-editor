import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { fileImportPlugin } from './fileImportPlugin';
import type { PluginContext } from './types';

afterEach(() => vi.unstubAllGlobals());

const ctx: PluginContext = { setDoc: vi.fn(), getDoc: () => '', run: vi.fn() };

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

  it('disables Import until a file and a table are chosen, then POSTs FormData on submit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ table: 'events', format: 'CSVWithNames', rowsWritten: 5, queryId: 'q1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = renderPanel();

    const importButton = screen.getByRole('button', { name: /import/i });
    expect(importButton).toBeDisabled();

    // The Click UI FileUpload renders a hidden <input type="file">; fire a change on it.
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Still disabled with no table.
    expect(importButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Existing table/i), {
      target: { value: 'events' },
    });

    await waitFor(() => expect(importButton).not.toBeDisabled());
    fireEvent.click(importButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/import');
    expect(options.method).toBe('POST');
    const body = options.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('table')).toBe('events');
    expect(body.get('format')).toBe('CSVWithNames');
    expect(body.get('file')).toBeInstanceOf(File);
  });
});

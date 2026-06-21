import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { saveQueryPlugin } from './saveQueryPlugin';
import type { PluginContext } from './types';
import type { SavedQuery } from '../api/types';

const saved: SavedQuery[] = [
  {
    id: '1',
    name: 'My saved query',
    sql: 'SELECT 42;',
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
  },
];

afterEach(() => vi.unstubAllGlobals());

function renderPanel(ctx: PluginContext) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ClickUIProvider theme="light">
      <QueryClientProvider client={queryClient}>
        {saveQueryPlugin.renderPanel(ctx, () => {})}
      </QueryClientProvider>
    </ClickUIProvider>,
  );
}

describe('saveQueryPlugin', () => {
  it('lists saved queries and loads one into the editor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => saved }));
    const setDoc = vi.fn();
    renderPanel({ setDoc, getDoc: () => '', run: vi.fn() });

    fireEvent.click(await screen.findByText('My saved query'));

    expect(setDoc).toHaveBeenCalledWith('SELECT 42;');
  });

  it('renames a saved query via PUT and refreshes the list', async () => {
    const renamed: SavedQuery = { ...saved[0], name: 'Renamed query' };
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => renamed } as Response);
      }
      // GET list: after the PUT-driven invalidation, return the renamed record.
      const list = fetchMock.mock.calls.some(([, o]) => o?.method === 'PUT') ? [renamed] : saved;
      return Promise.resolve({ ok: true, json: async () => list } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPanel({ setDoc: vi.fn(), getDoc: () => '', run: vi.fn() });

    // Enter rename mode, type a new name, confirm.
    fireEvent.click(await screen.findByTitle('Rename My saved query'));
    fireEvent.change(screen.getByPlaceholderText('Rename query'), {
      target: { value: 'Renamed query' },
    });
    fireEvent.click(screen.getByTitle('Save name'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
      expect(putCall).toBeTruthy();
      expect(String(putCall![0])).toBe('/api/queries/1');
      expect(JSON.parse(String(putCall![1]?.body))).toEqual({ name: 'Renamed query' });
    });

    // The invalidated list re-renders with the new name.
    expect(await screen.findByText('Renamed query')).toBeInTheDocument();
  });

  it('does not call PUT for an empty name (confirm stays disabled)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => saved } as Response);
    vi.stubGlobal('fetch', fetchMock);

    renderPanel({ setDoc: vi.fn(), getDoc: () => '', run: vi.fn() });

    fireEvent.click(await screen.findByTitle('Rename My saved query'));
    fireEvent.change(screen.getByPlaceholderText('Rename query'), { target: { value: '   ' } });

    expect(screen.getByTitle('Save name')).toBeDisabled();
    fireEvent.click(screen.getByTitle('Save name'));
    expect(fetchMock.mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(false);
  });

  it('saves the current editor script under a name', async () => {
    const created: SavedQuery = { id: '2', name: 'New', sql: 'SELECT 99;', createdAt: '', updatedAt: '' };
    const fetchMock = vi.fn((_url: string, options?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () => (options?.method === 'POST' ? created : []),
      } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderPanel({ setDoc: vi.fn(), getDoc: () => 'SELECT 99;', run: vi.fn() });

    fireEvent.change(screen.getByPlaceholderText('Name this query'), { target: { value: 'New' } });
    // With no saved queries listed, the save icon button is the only button.
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(JSON.parse(String(postCall![1]?.body))).toEqual({ name: 'New', sql: 'SELECT 99;' });
    });
  });
});

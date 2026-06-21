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

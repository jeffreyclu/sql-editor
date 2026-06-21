import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateSavedQuery } from './savedQueries';
import { ApiError } from './apiClient';
import type { SavedQuery } from './types';

const existing: SavedQuery = {
  id: 'abc',
  name: 'Old name',
  sql: 'SELECT 1;',
  createdAt: '2026-06-20T10:00:00.000Z',
  updatedAt: '2026-06-20T10:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('updateSavedQuery', () => {
  it('PUTs the changes to /api/queries/:id and returns the updated record', async () => {
    const updated: SavedQuery = { ...existing, name: 'New name' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => updated } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateSavedQuery('abc', { name: 'New name' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/queries/abc');
    expect(options?.method).toBe('PUT');
    expect(JSON.parse(String(options?.body))).toEqual({ name: 'New name' });
    expect(result).toEqual(updated);
  });

  it('throws an ApiError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'not found' }),
      } as Response),
    );

    await expect(updateSavedQuery('missing', { name: 'x' })).rejects.toBeInstanceOf(ApiError);
  });
});

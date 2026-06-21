import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSql } from './ai';
import { ApiError } from './apiClient';
import type { SchemaTree } from './schema';

afterEach(() => vi.unstubAllGlobals());

const schema: SchemaTree = [
  { name: 'default', tables: [{ name: 'events', columns: [{ name: 'id', type: 'UInt64' }] }] },
];

describe('generateSql', () => {
  it('POSTs { prompt, schema } as JSON to /api/ai/sql and returns the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sql: 'SELECT count() FROM default.events', explanation: 'Counts rows' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateSql({ prompt: 'how many events?', schema });

    expect(result).toEqual({
      sql: 'SELECT count() FROM default.events',
      explanation: 'Counts rows',
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/sql');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(options.body))).toEqual({ prompt: 'how many events?', schema });
  });

  it('throws an ApiError carrying the backend { error } message + status on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'AI assistant not configured' }),
      }),
    );

    const promise = generateSql({ prompt: 'anything' });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(generateSql({ prompt: 'anything' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: 'AI assistant not configured',
    });
  });

  it('falls back to a status-line message when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );

    await expect(generateSql({ prompt: 'x' })).rejects.toMatchObject({
      status: 500,
      message: 'Request failed with status 500',
    });
  });
});

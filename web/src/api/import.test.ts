import { afterEach, describe, expect, it, vi } from 'vitest';
import { importFile } from './import';
import { ApiError } from './apiClient';

afterEach(() => vi.unstubAllGlobals());

describe('importFile', () => {
  it('POSTs FormData with file, table and format, and returns the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ table: 'events', format: 'CSV', rowsWritten: 3, queryId: 'q1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' });
    const result = await importFile({ file, table: 'events', format: 'CSV' });

    expect(result).toEqual({ table: 'events', format: 'CSV', rowsWritten: 3, queryId: 'q1' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/import');
    expect(options.method).toBe('POST');
    const body = options.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBe(file);
    expect(body.get('table')).toBe('events');
    expect(body.get('format')).toBe('CSV');
  });

  it('omits the format field when no format is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ table: 'events', format: 'CSVWithNames', queryId: 'q2' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'data.csv');
    await importFile({ file, table: 'events' });

    const body = (fetchMock.mock.calls[0][1].body as FormData);
    expect(body.has('format')).toBe(false);
  });

  it('throws an ApiError carrying the backend { error } message on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "unknown table 'nope'" }) }),
    );

    const file = new File(['x'], 'data.csv');
    await expect(importFile({ file, table: 'nope' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: "unknown table 'nope'",
    });
    await expect(importFile({ file, table: 'nope' })).rejects.toBeInstanceOf(ApiError);
  });
});

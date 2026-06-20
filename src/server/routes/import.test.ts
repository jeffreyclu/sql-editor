import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Readable } from 'stream';
import { createImportRouter } from './import';
import type { ClickHouseExecutor, InsertParams } from '../clickhouse';

/** Build an executor whose `insert` is the given mock; query/command should never be called. */
function executorWith(insert: ClickHouseExecutor['insert']): ClickHouseExecutor {
  return {
    query: async () => { throw new Error('unexpected query'); },
    command: async () => { throw new Error('unexpected command'); },
    insert,
  };
}

function appWith(executor: ClickHouseExecutor, maxBytes?: number) {
  const app = express();
  app.use('/import', createImportRouter({ createExecutor: () => executor, maxBytes }));
  return app;
}

/** Drain a Readable to a string so tests can assert the forwarded file contents. */
async function readAll(stream: Readable): Promise<string> {
  let out = '';
  for await (const chunk of stream) {
    out += chunk.toString();
  }
  return out;
}

describe('POST /import', () => {
  it('streams an uploaded CSV into the target table and returns the summary', async () => {
    let received: { table: string; format: string; body: string } | undefined;
    const insert = vi.fn(async (params: InsertParams) => {
      // Raw formats require a byte stream; the ClickHouse client rejects object-mode streams.
      expect(params.values.readableObjectMode).toBe(false);
      received = { table: params.table, format: params.format, body: await readAll(params.values) };
      return { query_id: 'ins-1', rowsWritten: 2 };
    });

    const res = await request(appWith(executorWith(insert)))
      .post('/import')
      .field('table', 'demo')
      .attach('file', Buffer.from('id,label\n1,one\n2,two\n'), 'demo.csv');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ table: 'demo', format: 'CSVWithNames', rowsWritten: 2, queryId: 'ins-1' });
    expect(received).toEqual({ table: 'demo', format: 'CSVWithNames', body: 'id,label\n1,one\n2,two\n' });
  });

  it('honors an explicit allowed format', async () => {
    const insert = vi.fn(async () => ({ query_id: 'ins-2', rowsWritten: 1 }));

    const res = await request(appWith(executorWith(insert)))
      .post('/import')
      .field('table', 'demo')
      .field('format', 'JSONEachRow')
      .attach('file', Buffer.from('{"id":1}\n'), 'demo.json');

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ table: 'demo', format: 'JSONEachRow' }));
  });

  it('returns 400 when the file is missing', async () => {
    const res = await request(appWith(executorWith(vi.fn())))
      .post('/import')
      .field('table', 'demo');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file/i);
  });

  it('returns 400 when the table is missing', async () => {
    const res = await request(appWith(executorWith(vi.fn())))
      .post('/import')
      .attach('file', Buffer.from('a\n1\n'), 'demo.csv');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/table/i);
  });

  it('returns 400 for an unsupported format', async () => {
    const res = await request(appWith(executorWith(vi.fn())))
      .post('/import')
      .field('table', 'demo')
      .field('format', 'Parquet')
      .attach('file', Buffer.from('x'), 'demo.bin');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported format/i);
  });

  it('returns 400 for an invalid table name without touching ClickHouse', async () => {
    const insert = vi.fn(async () => ({ query_id: 'x', rowsWritten: 0 }));

    const res = await request(appWith(executorWith(insert)))
      .post('/import')
      .field('table', 'bad; DROP TABLE x')
      .attach('file', Buffer.from('id\n1\n'), 'demo.csv');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid table name/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it('accepts a database-qualified table name', async () => {
    const insert = vi.fn(async () => ({ query_id: 'x', rowsWritten: 1 }));

    const res = await request(appWith(executorWith(insert)))
      .post('/import')
      .field('table', 'analytics.events')
      .attach('file', Buffer.from('id\n1\n'), 'demo.csv');

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ table: 'analytics.events' }));
  });

  it('surfaces an insert rejection as a 400 with the message', async () => {
    const insert = vi.fn(async () => {
      throw new Error("Table demo doesn't exist");
    });

    const res = await request(appWith(executorWith(insert)))
      .post('/import')
      .field('table', 'demo')
      .attach('file', Buffer.from('id\n1\n'), 'demo.csv');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/doesn't exist/);
  });

  it('returns 413 when the upload exceeds the size limit', async () => {
    const res = await request(appWith(executorWith(vi.fn()), 8))
      .post('/import')
      .field('table', 'demo')
      .attach('file', Buffer.from('way-too-large-payload'), 'demo.csv');

    expect(res.status).toBe(413);
  });
});

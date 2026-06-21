import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Readable } from 'stream';
import { createImportRouter, inferColumnNames } from './import';
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

  it('creates the table from the header before inserting when createTable is set', async () => {
    const command = vi.fn(async (_sql: string) => ({ query_id: 'ddl-1' }));
    const insert = vi.fn(async () => ({ query_id: 'ins-3', rowsWritten: 2 }));
    const executor: ClickHouseExecutor = {
      query: async () => { throw new Error('unexpected query'); },
      command,
      insert,
    };

    const res = await request(appWith(executor))
      .post('/import')
      .field('table', 'new_table')
      .field('createTable', 'true')
      .attach('file', Buffer.from('id,label\n1,one\n2,two\n'), 'new.csv');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ table: 'new_table', created: true, rowsWritten: 2 });

    // CREATE runs first, with the header columns as Nullable(String); then the insert.
    expect(command).toHaveBeenCalledTimes(1);
    const ddl = command.mock.calls[0][0];
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS new_table');
    expect(ddl).toContain('`id` Nullable(String)');
    expect(ddl).toContain('`label` Nullable(String)');
    expect(ddl).toContain('ENGINE = MergeTree ORDER BY tuple()');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('does not create a table when createTable is not set', async () => {
    const command = vi.fn(async () => ({ query_id: 'ddl' }));
    const insert = vi.fn(async () => ({ query_id: 'ins', rowsWritten: 1 }));

    await request(appWith({ query: async () => { throw new Error('no'); }, command, insert }))
      .post('/import')
      .field('table', 'demo')
      .attach('file', Buffer.from('id\n1\n'), 'demo.csv');

    expect(command).not.toHaveBeenCalled();
  });
});

describe('inferColumnNames', () => {
  it('reads CSVWithNames headers, honouring quotes and commas', () => {
    const csv = Buffer.from('id,"full, name",notes\r\n1,"a",x\n');
    expect(inferColumnNames(csv, 'CSVWithNames')).toEqual(['id', 'full, name', 'notes']);
  });

  it('reads TabSeparatedWithNames headers', () => {
    const tsv = Buffer.from('id\tlabel\tvalue\n1\ta\t2\n');
    expect(inferColumnNames(tsv, 'TabSeparatedWithNames')).toEqual(['id', 'label', 'value']);
  });

  it('reads JSONEachRow keys from the first object', () => {
    const json = Buffer.from('{"id":1,"label":"a"}\n{"id":2}\n');
    expect(inferColumnNames(json, 'JSONEachRow')).toEqual(['id', 'label']);
  });

  it('synthesises positional names for headerless formats', () => {
    expect(inferColumnNames(Buffer.from('1,2,3\n'), 'CSV')).toEqual(['c1', 'c2', 'c3']);
    expect(inferColumnNames(Buffer.from('a\tb\n'), 'TabSeparated')).toEqual(['c1', 'c2']);
  });

  it('falls back to positional names for blank header cells', () => {
    expect(inferColumnNames(Buffer.from('id,,notes\n'), 'CSVWithNames')).toEqual(['id', 'c2', 'notes']);
  });

  it('returns [] for an empty file', () => {
    expect(inferColumnNames(Buffer.from(''), 'CSVWithNames')).toEqual([]);
  });
});

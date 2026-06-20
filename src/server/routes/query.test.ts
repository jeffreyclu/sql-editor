import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { ResponseJSON } from '@clickhouse/client';
import { createApp } from '../app';
import { createDatabase } from '../db/db';
import { createHistoryRepository } from '../db/historyRepository';
import type { ClickHouseExecutor, QueryResult } from '../clickhouse';

/** Build a `QueryResult` mock mirroring ClickHouse's JSON response shape. */
function jsonResult(
  data: Record<string, unknown>[],
  meta: { name: string; type: string }[],
  opts: { queryId?: string; elapsed?: number } = {},
): QueryResult {
  const { queryId = 'query-id', elapsed = 0.005 } = opts;
  return {
    query_id: queryId,
    json: async <T = unknown>() =>
      ({
        data,
        meta,
        statistics: { elapsed, rows_read: data.length, bytes_read: 0 },
        rows: data.length,
        query_id: queryId,
      }) as ResponseJSON<T>,
  };
}

type QueryFn = ClickHouseExecutor['query'];
type CommandFn = ClickHouseExecutor['command'];

function makeExecutor(handlers: { query?: QueryFn; command?: CommandFn }): ClickHouseExecutor {
  return {
    query: handlers.query ?? (async (sql) => { throw new Error(`unexpected query: ${sql}`); }),
    command: handlers.command ?? (async (sql) => { throw new Error(`unexpected command: ${sql}`); }),
    insert: async () => { throw new Error('unexpected insert'); },
  };
}

describe('POST /query', () => {
  it('returns 400 when the query is missing or empty', async () => {
    const app = createApp({ createExecutor: () => makeExecutor({}) });

    for (const body of [{}, { query: '' }, { query: '   ' }, { query: 42 }]) {
      const res = await request(app).post('/query').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("'query' is required");
    }
  });

  it('executes a single SELECT and maps columns, rows, timing and id', async () => {
    const query = vi.fn(async (_sql: string) =>
      jsonResult([{ a: 1 }], [{ name: 'a', type: 'UInt8' }], { queryId: 'q1', elapsed: 0.01 }),
    );
    const app = createApp({ createExecutor: () => makeExecutor({ query }) });

    const res = await request(app).post('/query').send({ query: 'SELECT 1 AS a' });

    expect(res.status).toBe(200);
    expect(res.body.statements).toHaveLength(1);
    expect(res.body.statements[0]).toMatchObject({
      statement: 'SELECT 1 AS a',
      kind: 'query',
      status: 'success',
      columns: [{ name: 'a', type: 'UInt8' }],
      rows: [{ a: 1 }],
      rowCount: 1,
      truncated: false,
      elapsedMs: 10,
      queryId: 'q1',
    });
    // Row cap is pushed to ClickHouse (limit + 1, to detect truncation) — DL-009 / HIGH-1.
    expect(query).toHaveBeenCalledWith('SELECT 1 AS a', { maxRows: 1001 });
  });

  it('executes a command statement without returning rows', async () => {
    const command = vi.fn(async (_sql: string) => ({ query_id: 'c1' }));
    const app = createApp({ createExecutor: () => makeExecutor({ command }) });

    const res = await request(app)
      .post('/query')
      .send({ query: 'CREATE TABLE t (a UInt8) ENGINE = Memory' });

    expect(res.status).toBe(200);
    expect(res.body.statements[0]).toMatchObject({ kind: 'command', status: 'success', queryId: 'c1' });
    expect(res.body.statements[0].rows).toBeUndefined();
  });

  it('runs a multi-statement script in order, classifying each statement', async () => {
    const command = vi.fn(async (_sql: string) => ({ query_id: 'cmd' }));
    const query = vi.fn(async (_sql: string) => jsonResult([{ id: 1 }], [{ name: 'id', type: 'UInt8' }]));
    const app = createApp({ createExecutor: () => makeExecutor({ query, command }) });

    const script =
      'CREATE TABLE t (id UInt8) ENGINE = Memory; INSERT INTO t VALUES (1); SELECT * FROM t';
    const res = await request(app).post('/query').send({ query: script });

    expect(res.body.statements.map((s: { kind: string }) => s.kind)).toEqual([
      'command',
      'command',
      'query',
    ]);
    expect(res.body.statements.every((s: { status: string }) => s.status === 'success')).toBe(true);
    expect(command).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('stops on the first error and leaves remaining statements unrun', async () => {
    const command = vi
      .fn(async (_sql: string) => ({ query_id: 'cmd' }))
      .mockResolvedValueOnce({ query_id: 'create-ok' })
      .mockRejectedValueOnce(new Error('boom'));
    const query = vi.fn(async (_sql: string) => jsonResult([], []));
    const app = createApp({ createExecutor: () => makeExecutor({ query, command }) });

    const script =
      'CREATE TABLE t (id UInt8) ENGINE = Memory; INSERT INTO t VALUES (1); SELECT * FROM t';
    const res = await request(app).post('/query').send({ query: script });

    expect(res.status).toBe(200);
    expect(res.body.statements).toHaveLength(2); // third statement never executed
    expect(res.body.statements[0].status).toBe('success');
    expect(res.body.statements[1]).toMatchObject({ status: 'error', error: { message: 'boom' } });
    expect(query).not.toHaveBeenCalled();
  });

  it('caps returned rows at the configured limit and flags truncation', async () => {
    const rows = Array.from({ length: 5 }, (_, n) => ({ n }));
    const query = vi.fn(async (_sql: string) => jsonResult(rows, [{ name: 'n', type: 'UInt8' }]));
    const app = createApp({ createExecutor: () => makeExecutor({ query }), rowLimit: 2 });

    const res = await request(app).post('/query').send({ query: 'SELECT number AS n FROM numbers(5)' });

    expect(res.body.statements[0]).toMatchObject({ truncated: true, rowCount: 2 });
    expect(res.body.statements[0].rows).toHaveLength(2);
    expect(query).toHaveBeenCalledWith('SELECT number AS n FROM numbers(5)', { maxRows: 3 });
  });

  it('returns JSON { error } (not HTML) for a malformed request body — HIGH-2', async () => {
    const app = createApp({ createExecutor: () => makeExecutor({}) });

    const res = await request(app)
      .post('/query')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(res.status).toBe(400);
    expect(res.type).toMatch(/json/);
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 500 on an unexpected transport fault (not a SQL error)', async () => {
    const app = createApp({
      createExecutor: () => {
        throw new Error('cannot connect to ClickHouse');
      },
    });

    const res = await request(app).post('/query').send({ query: 'SELECT 1' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('cannot connect to ClickHouse');
  });

  describe('history auto-logging (DL-013)', () => {
    it('records a successful run with statement count and total elapsed', async () => {
      const historyRepository = createHistoryRepository(createDatabase(':memory:'));
      const query = vi.fn(async (_sql: string) =>
        jsonResult([{ a: 1 }], [{ name: 'a', type: 'UInt8' }], { elapsed: 0.02 }),
      );
      const app = createApp({ createExecutor: () => makeExecutor({ query }), historyRepository });

      await request(app).post('/query').send({ query: 'SELECT 1 AS a' });

      const history = historyRepository.list();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        sql: 'SELECT 1 AS a',
        status: 'success',
        statementCount: 1,
        elapsedMs: 20,
      });
    });

    it('records a failed run with error message and error status', async () => {
      const historyRepository = createHistoryRepository(createDatabase(':memory:'));
      const command = vi.fn(async (_sql: string) => {
        throw new Error('bad ddl');
      });
      const app = createApp({ createExecutor: () => makeExecutor({ command }), historyRepository });

      await request(app)
        .post('/query')
        .send({ query: 'CREATE TABLE t (a UInt8) ENGINE = Memory' });

      const [entry] = historyRepository.list();
      expect(entry).toMatchObject({ status: 'error', error: 'bad ddl', statementCount: 1 });
    });
  });
});

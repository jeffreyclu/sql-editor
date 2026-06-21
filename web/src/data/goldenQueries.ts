// The golden dataset (DL-016): a single curated source of SQL shared by the frontend (the
// Examples picker) and the backend tests (splitter/classifier + /query route fixtures). Keep this
// the one source of truth so the demo data and the test corpus never drift. Coverage: a simple
// SELECT, an aggregation, a system-table browse, a self-contained multi-statement script (Memory
// engine), and a deliberately invalid query (the error path).

export type GoldenCategory = 'select' | 'ddl' | 'multi-statement' | 'error' | 'system';

export interface GoldenQuery {
  id: string;
  title: string;
  description: string;
  category: GoldenCategory;
  sql: string;
}

export const goldenQueries: readonly GoldenQuery[] = [
  {
    id: 'select-constant',
    title: 'Select a constant',
    description: 'The simplest query — one row, one column.',
    category: 'select',
    sql: 'SELECT 1 AS one;',
  },
  {
    id: 'numbers-aggregation',
    title: 'Aggregate over numbers()',
    description: 'GROUP BY with count and sum over a generated range.',
    category: 'select',
    sql: [
      'SELECT',
      '    number % 3 AS bucket,',
      '    count() AS cnt,',
      '    sum(number) AS total',
      'FROM numbers(100)',
      'GROUP BY bucket',
      'ORDER BY bucket;',
    ].join('\n'),
  },
  {
    id: 'system-tables',
    title: 'Browse tables',
    description: 'List user tables from system.tables.',
    category: 'system',
    sql: [
      'SELECT database, name, engine',
      'FROM system.tables',
      "WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')",
      'ORDER BY database, name',
      'LIMIT 50;',
    ].join('\n'),
  },
  {
    id: 'multi-statement-memory',
    title: 'Create, insert, select',
    description: 'A self-contained multi-statement script on a Memory-engine table.',
    category: 'multi-statement',
    sql: [
      'CREATE TABLE IF NOT EXISTS demo_numbers (n UInt32) ENGINE = Memory;',
      'INSERT INTO demo_numbers VALUES (1), (2), (3), (4), (5);',
      'SELECT n, n * n AS squared FROM demo_numbers ORDER BY n;',
    ].join('\n'),
  },
  {
    id: 'invalid-query',
    title: 'Deliberately invalid',
    description: 'References a missing table — shows the error path.',
    category: 'error',
    sql: 'SELECT * FROM table_that_does_not_exist;',
  },
  {
    id: 'cte-window',
    title: 'CTE with a window function',
    description: 'A common table expression feeding a running total via a window function.',
    category: 'select',
    sql: [
      'WITH per_bucket AS (',
      '    SELECT number % 4 AS bucket, count() AS cnt',
      '    FROM numbers(1000)',
      '    GROUP BY bucket',
      ')',
      'SELECT bucket, cnt, sum(cnt) OVER (ORDER BY bucket) AS running_total',
      'FROM per_bucket',
      'ORDER BY bucket;',
    ].join('\n'),
  },
  {
    id: 'nested-types',
    title: 'Arrays, maps and lambdas',
    description: 'Builds array/map/tuple values and maps a lambda over an array.',
    category: 'select',
    sql: [
      'SELECT',
      '    groupArray(number) AS arr,',
      '    arrayMap(x -> x * x, [1, 2, 3]) AS squares,',
      "    map('a', 1, 'b', 2) AS counts",
      'FROM numbers(5);',
    ].join('\n'),
  },
  {
    id: 'join-subquery',
    title: 'Join with a subquery',
    description: 'Joins system.tables to per-table column counts from system.columns.',
    category: 'system',
    sql: [
      'SELECT t.name, c.columns',
      'FROM system.tables AS t',
      'INNER JOIN (',
      '    SELECT table, count() AS columns',
      '    FROM system.columns',
      '    GROUP BY table',
      ') AS c ON t.name = c.table',
      "WHERE t.database = 'system'",
      'ORDER BY c.columns DESC',
      'LIMIT 10;',
    ].join('\n'),
  },
  {
    id: 'ddl-create-table',
    title: 'Create a table (DDL)',
    description: 'A single DDL statement — runs as a command and returns no rows.',
    category: 'ddl',
    sql: 'CREATE TABLE IF NOT EXISTS demo_events (ts DateTime, kind String) ENGINE = Memory;',
  },
  {
    id: 'multi-statement-crud',
    title: 'Create, insert, query, drop',
    description: 'A longer self-contained script: create, two inserts, an aggregate, then clean up.',
    category: 'multi-statement',
    sql: [
      'CREATE TABLE IF NOT EXISTS demo_orders (id UInt32, amount Decimal(10, 2)) ENGINE = Memory;',
      'INSERT INTO demo_orders VALUES (1, 9.99), (2, 19.95);',
      'INSERT INTO demo_orders VALUES (3, 4.50);',
      'SELECT count() AS orders, sum(amount) AS revenue FROM demo_orders;',
      'DROP TABLE demo_orders;',
    ].join('\n'),
  },
  {
    id: 'large-result',
    title: 'Large result (truncated)',
    description: 'Returns more rows than the server cap — shows truncation and the loading state.',
    category: 'select',
    sql: 'SELECT number, number * 2 AS doubled FROM numbers(100000);',
  },
  {
    id: 'tricky-literals',
    title: 'Semicolons and comments inside strings',
    description: 'One statement whose string literals contain ; and -- — splitting keeps it whole.',
    category: 'select',
    sql: "SELECT 'a; b' AS literal, 'not -- a comment' AS note;",
  },
];

import { describe, expect, it } from 'vitest';
import { affectsSchema, qualifiedTableNames, rowsToTree, type SchemaTree } from './schema';

describe('rowsToTree', () => {
  it('groups flat system.columns rows into a database → table → columns tree', () => {
    const rows = [
      { database: 'shop', table: 'orders', column: 'id', type: 'UInt64' },
      { database: 'shop', table: 'orders', column: 'total', type: 'Decimal(10, 2)' },
      { database: 'shop', table: 'customers', column: 'name', type: 'String' },
      { database: 'analytics', table: 'events', column: 'ts', type: 'DateTime' },
    ];

    expect(rowsToTree(rows)).toEqual([
      {
        name: 'shop',
        tables: [
          {
            name: 'orders',
            columns: [
              { name: 'id', type: 'UInt64' },
              { name: 'total', type: 'Decimal(10, 2)' },
            ],
          },
          { name: 'customers', columns: [{ name: 'name', type: 'String' }] },
        ],
      },
      {
        name: 'analytics',
        tables: [{ name: 'events', columns: [{ name: 'ts', type: 'DateTime' }] }],
      },
    ]);
  });

  it('returns an empty tree for no rows', () => {
    expect(rowsToTree([])).toEqual([]);
  });

  it('skips malformed rows missing database/table/column', () => {
    const rows = [
      { database: 'shop', table: 'orders', column: 'id', type: 'UInt64' },
      { database: 'shop', table: 'orders' }, // missing column
      { table: 'orphan', column: 'x', type: 'String' }, // missing database
    ];

    expect(rowsToTree(rows)).toEqual([
      { name: 'shop', tables: [{ name: 'orders', columns: [{ name: 'id', type: 'UInt64' }] }] },
    ]);
  });
});

describe('qualifiedTableNames', () => {
  it('flattens the tree to database-qualified, sorted table names', () => {
    const tree: SchemaTree = [
      {
        name: 'shop',
        tables: [
          { name: 'orders', columns: [] },
          { name: 'customers', columns: [] },
        ],
      },
      { name: 'analytics', tables: [{ name: 'events', columns: [] }] },
    ];

    expect(qualifiedTableNames(tree)).toEqual([
      'analytics.events',
      'shop.customers',
      'shop.orders',
    ]);
  });

  it('returns an empty list for an empty tree', () => {
    expect(qualifiedTableNames([])).toEqual([]);
  });
});

describe('affectsSchema', () => {
  const stmts = (...sql: string[]) => sql.map((statement) => ({ statement }));

  it('is true for schema-changing DDL (create/drop/alter/rename)', () => {
    expect(affectsSchema(stmts('CREATE TABLE t (id UInt32) ENGINE = Memory'))).toBe(true);
    expect(affectsSchema(stmts('DROP TABLE t'))).toBe(true);
    expect(affectsSchema(stmts('ALTER TABLE t ADD COLUMN c String'))).toBe(true);
    expect(affectsSchema(stmts('RENAME TABLE a TO b'))).toBe(true);
    expect(affectsSchema(stmts('detach table t'))).toBe(true); // case-insensitive
  });

  it('is true if any statement in a multi-statement run is DDL', () => {
    expect(affectsSchema(stmts('SELECT 1', 'DROP TABLE t'))).toBe(true);
  });

  it('is false for data/session statements', () => {
    expect(affectsSchema(stmts('SELECT * FROM t'))).toBe(false);
    expect(affectsSchema(stmts('INSERT INTO t VALUES (1)'))).toBe(false);
    expect(affectsSchema(stmts('TRUNCATE TABLE t'))).toBe(false);
    expect(affectsSchema(stmts('SET max_threads = 4'))).toBe(false);
  });

  it('sees through leading comments and whitespace', () => {
    expect(affectsSchema(stmts('-- make it\n  CREATE TABLE t (id UInt32) ENGINE = Memory'))).toBe(true);
    expect(affectsSchema(stmts('/* c */ SELECT 1'))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { rowsToTree } from './schema';

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

import { memo, useMemo } from 'react';
import { Table } from '@clickhouse/click-ui';
import type { ColumnMeta } from '../api/types';

// Pure results grid over the Click UI Table (DL-009 — server caps rows; virtualization deferred).
export interface ResultTableProps {
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
}

/** Render any ClickHouse value as table text: null/undefined explicit, objects as JSON. */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ResultTableComponent({ columns, rows }: ResultTableProps) {
  const headers = useMemo(
    () =>
      columns.map((column) => ({
        label: (
          <span className="column-header">
            <span className="column-header__name">{column.name}</span>
            <span className="column-header__type">{column.type}</span>
          </span>
        ),
      })),
    [columns],
  );

  const tableRows = useMemo(
    () =>
      rows.map((row, index) => ({
        id: index,
        items: columns.map((column) => ({ label: formatCell(row[column.name]) })),
      })),
    [rows, columns],
  );

  return <Table size="sm" headers={headers} rows={tableRows} noDataMessage="No rows returned" />;
}

export const ResultTable = memo(ResultTableComponent);

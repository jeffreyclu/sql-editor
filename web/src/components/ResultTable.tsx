import { memo, useMemo, useState } from 'react';
import { Container, Icon, Table, Text, TextField } from '@clickhouse/click-ui';
import type { ColumnMeta } from '../api/types';

// Pure results grid over the Click UI Table (DL-009 — server caps rows; virtualization deferred).
// Display-only client features (DL-024): a case-insensitive substring search across all cells and a
// click-to-sort on column headers (asc → desc → none). Both operate on the already server-capped
// rows — no refetch — so local component state is appropriate (it never feeds server state, DL-020).
export interface ResultTableProps {
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
}

type SortDir = 'asc' | 'desc';
interface SortState {
  /** Index into `columns` of the sorted column. */
  column: number;
  dir: SortDir;
}

/** Render any ClickHouse value as table text: null/undefined explicit, objects as JSON. */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** A cell is "numeric" when its rendered text parses as a finite number (and isn't blank). */
function asNumber(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function ResultTableComponent({ columns, rows }: ResultTableProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);

  // Search filters first, then sort orders — both over the rendered cell text so they match exactly
  // what the user sees (same formatCell as the grid).
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered =
      needle === ''
        ? rows
        : rows.filter((row) =>
            columns.some((column) => formatCell(row[column.name]).toLowerCase().includes(needle)),
          );

    if (!sort) return filtered;

    const { name } = columns[sort.column];
    const factor = sort.dir === 'asc' ? 1 : -1;
    // Stable sort: decorate with the original index and use it as a tiebreaker.
    return filtered
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const aText = formatCell(a.row[name]);
        const bText = formatCell(b.row[name]);
        const aNum = asNumber(aText);
        const bNum = asNumber(bText);
        let cmp: number;
        if (aNum !== null && bNum !== null) {
          cmp = aNum - bNum;
        } else {
          cmp = aText.localeCompare(bText);
        }
        return cmp !== 0 ? cmp * factor : a.index - b.index;
      })
      .map((entry) => entry.row);
  }, [rows, columns, search, sort]);

  // Cycle the clicked column asc → desc → none (original order). Click UI computes its own
  // asc/desc toggle for the indicator, but we drive the tri-state ourselves (DL-017: we still use
  // the built-in sortable header + caret indicator via `isSortable`/`sortDir`).
  const handleSort = (columnIndex: number) => {
    setSort((current) => {
      if (!current || current.column !== columnIndex) return { column: columnIndex, dir: 'asc' };
      if (current.dir === 'asc') return { column: columnIndex, dir: 'desc' };
      return null;
    });
  };

  const headers = useMemo(
    () =>
      columns.map((column, columnIndex) => ({
        label: (
          <span className="column-header">
            <span className="column-header__name">{column.name}</span>
            <span className="column-header__type">{column.type}</span>
          </span>
        ),
        isSortable: true,
        sortDir: sort?.column === columnIndex ? sort.dir : undefined,
      })),
    [columns, sort],
  );

  const tableRows = useMemo(
    () =>
      visibleRows.map((row, index) => ({
        id: index,
        items: columns.map((column) => ({ label: formatCell(row[column.name]) })),
      })),
    [visibleRows, columns],
  );

  const noMatches = rows.length > 0 && visibleRows.length === 0;

  return (
    <Container orientation="vertical" gap="sm" fillWidth>
      <TextField
        value={search}
        onChange={(value) => setSearch(value)}
        placeholder="Search results"
        startContent={<Icon name="search" size="sm" />}
        clear
      />
      {noMatches ? (
        <Text color="muted">No matching rows.</Text>
      ) : (
        <Table
          size="sm"
          headers={headers}
          rows={tableRows}
          noDataMessage="No rows returned"
          onSort={(_dir, _header, index) => handleSort(index)}
        />
      )}
    </Container>
  );
}

export const ResultTable = memo(ResultTableComponent);

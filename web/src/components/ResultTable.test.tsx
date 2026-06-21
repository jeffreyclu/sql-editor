import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { ResultTable } from './ResultTable';
import type { ColumnMeta } from '../api/types';

const columns: ColumnMeta[] = [
  { name: 'id', type: 'UInt32' },
  { name: 'name', type: 'String' },
];

const rows = [
  { id: 2, name: 'bob' },
  { id: 10, name: 'amy' },
  { id: 1, name: 'cat' },
];

function renderTable() {
  return render(
    <ClickUIProvider theme="light">
      <ResultTable columns={columns} rows={rows} />
    </ClickUIProvider>,
  );
}

/** Body rows in document order, reduced to the `id` column's value (cell text is `id` + type + value). */
function idColumn(container: HTMLElement): string[] {
  const tbody = container.querySelector('tbody');
  return Array.from(tbody?.querySelectorAll('tr') ?? []).map((tr) =>
    (tr.querySelector('td')?.textContent ?? '').replace('idUInt32', ''),
  );
}

function rowCount(container: HTMLElement): number {
  return container.querySelector('tbody')?.querySelectorAll('tr').length ?? 0;
}

/** The clickable target of a header is its inner content wrapper (Click UI puts onClick there). */
function headerTarget(container: HTMLElement, columnName: string): HTMLElement {
  const header = Array.from(container.querySelectorAll('th')).find((th) =>
    th.textContent?.startsWith(columnName),
  );
  return header!.querySelector('div') as HTMLElement;
}

describe('ResultTable search', () => {
  it('filters displayed rows by a case-insensitive substring across all cells', async () => {
    const { container } = renderTable();
    expect(rowCount(container)).toBe(3);

    await userEvent.type(screen.getByPlaceholderText('Search results'), 'AMY');

    expect(rowCount(container)).toBe(1);
    expect(screen.getByText('amy')).toBeInTheDocument();
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
  });

  it('shows the no-matching-rows empty state when nothing matches', async () => {
    const { container } = renderTable();

    await userEvent.type(screen.getByPlaceholderText('Search results'), 'zzz');

    expect(screen.getByText('No matching rows.')).toBeInTheDocument();
    expect(container.querySelector('tbody')).toBeNull();
  });

  it('restores all rows when the search is cleared', async () => {
    const { container } = renderTable();
    const input = screen.getByPlaceholderText('Search results');

    await userEvent.type(input, 'amy');
    expect(rowCount(container)).toBe(1);

    await userEvent.clear(input);
    expect(rowCount(container)).toBe(3);
  });
});

describe('ResultTable column sort', () => {
  it('cycles a column asc → desc → none on header clicks (numeric compare)', async () => {
    const { container } = renderTable();
    const idHeader = headerTarget(container, 'id');

    expect(idColumn(container)).toEqual(['2', '10', '1']); // original order

    await userEvent.click(idHeader);
    expect(idColumn(container)).toEqual(['1', '2', '10']); // asc, numeric (not lexical)

    await userEvent.click(idHeader);
    expect(idColumn(container)).toEqual(['10', '2', '1']); // desc

    await userEvent.click(idHeader);
    expect(idColumn(container)).toEqual(['2', '10', '1']); // back to original order
  });

  it('composes with search: filter then order', async () => {
    const { container } = renderTable();
    // Keep two rows (both names contain "a": amy, cat), then sort by id ascending.
    await userEvent.type(screen.getByPlaceholderText('Search results'), 'a');
    expect(rowCount(container)).toBe(2);

    await userEvent.click(headerTarget(container, 'id'));
    expect(idColumn(container)).toEqual(['1', '10']); // cat=1, amy=10 → ascending
  });
});

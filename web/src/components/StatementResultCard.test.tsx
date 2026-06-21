import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { StatementResultCard } from './StatementResultCard';
import type { StatementResult } from '../api/types';
import type { ResultAction } from '../plugins/types';

function exportAction(run: (result: StatementResult, index: number) => void): ResultAction {
  return {
    id: 'export-csv',
    label: 'Export CSV',
    icon: 'download',
    isAvailable: (r) => r.status === 'success' && r.kind === 'query' && (r.rows?.length ?? 0) > 0,
    run,
  };
}

function renderCard(result: StatementResult, actions?: ResultAction[]) {
  return render(
    <ClickUIProvider theme="light">
      <StatementResultCard result={result} index={0} actions={actions} />
    </ClickUIProvider>,
  );
}

const dataResult: StatementResult = {
  statement: 'SELECT 1',
  kind: 'query',
  status: 'success',
  columns: [{ name: 'id', type: 'UInt32' }],
  rows: [{ id: 1 }],
  rowCount: 1,
};

describe('StatementResultCard result actions', () => {
  it('runs an applicable action with the result and index when clicked', async () => {
    const run = vi.fn();
    renderCard(dataResult, [exportAction(run)]);

    // The card's only button is the (single) applicable action.
    await userEvent.click(screen.getByRole('button'));

    expect(run).toHaveBeenCalledWith(dataResult, 0);
  });

  it('hides actions that do not apply (e.g. a command result)', () => {
    renderCard({ statement: 'INSERT INTO t VALUES (1)', kind: 'command', status: 'success' }, [
      exportAction(vi.fn()),
    ]);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows no actions when none are registered', () => {
    renderCard(dataResult);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

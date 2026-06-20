import { memo } from 'react';
import { Badge, Container, Panel, Separator, Text } from '@clickhouse/click-ui';
import type { StatementResult } from '../api/types';
import { ResultTable } from './ResultTable';
import { ErrorBanner } from './ErrorBanner';

// Per-statement result panel built from Click UI primitives (DL-017): a Panel surface with a
// header Container (index · SQL · status Badge · metrics Text) over a body Container that adapts
// to the statement kind/status — Table for data, a note for commands, an Alert on failure.
export interface StatementResultCardProps {
  result: StatementResult;
  index: number;
}

function StatementResultCardComponent({ result, index }: StatementResultCardProps) {
  const { statement, kind, status, columns, rows, rowCount, truncated, elapsedMs } = result;

  return (
    <Panel color="default" orientation="vertical" gap="none" padding="none" radii="md" hasBorder fillWidth>
      <Container orientation="horizontal" alignItems="center" gap="sm" padding="sm" fillWidth>
        <Text size="sm" weight="medium" color="muted">{`#${index + 1}`}</Text>
        <code className="statement-card__sql" title={statement}>
          {statement}
        </code>
        <Badge size="sm" state={status === 'error' ? 'danger' : 'success'} text={status} />
        {status === 'success' && (
          <Text size="sm" color="muted">
            {metricsLabel(kind, rowCount, truncated, elapsedMs)}
          </Text>
        )}
      </Container>
      <Separator size="xs" />
      <Container padding="sm" fillWidth isOverflowScroll>
        {status === 'error' ? (
          <ErrorBanner title="Statement failed" message={result.error?.message ?? 'Unknown error'} />
        ) : kind === 'query' ? (
          <ResultTable columns={columns ?? []} rows={rows ?? []} />
        ) : (
          <Text size="sm" color="muted">
            Command executed successfully.
          </Text>
        )}
      </Container>
    </Panel>
  );
}

function metricsLabel(
  kind: StatementResult['kind'],
  rowCount: number | undefined,
  truncated: boolean | undefined,
  elapsedMs: number | undefined,
): string {
  const timing = typeof elapsedMs === 'number' ? `${elapsedMs} ms` : null;
  if (kind === 'command') {
    return ['executed', timing].filter(Boolean).join(' · ');
  }
  const count = rowCount ?? 0;
  const rowsLabel = `${count} row${count === 1 ? '' : 's'}${truncated ? ' (truncated)' : ''}`;
  return [rowsLabel, timing].filter(Boolean).join(' · ');
}

export const StatementResultCard = memo(StatementResultCardComponent);

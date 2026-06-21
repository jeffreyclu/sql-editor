import { memo } from 'react';
import { Badge, Container, IconButton, Panel, Separator, Text } from '@clickhouse/click-ui';
import type { StatementResult } from '../api/types';
import type { ResultAction } from '../plugins/types';
import { ResultTable } from './ResultTable';
import { ErrorBanner } from './ErrorBanner';
import { formatClickHouseError } from '../api/formatError';

// Per-statement result panel built from Click UI primitives (DL-017): a Panel surface with a
// header Container (index · SQL · status Badge · metrics · result actions) over a body that adapts
// to the statement kind/status — Table for data, a note for commands, an Alert on failure. The
// header's right side is one non-shrinking meta cluster so metrics never wrap; result actions
// (DL-024 — CSV export et al.) come from the plugin registry.
export interface StatementResultCardProps {
  result: StatementResult;
  index: number;
  /** Result-action plugins (DL-006/DL-024); each one that applies renders as an icon button. */
  actions?: ResultAction[];
}

function StatementResultCardComponent({ result, index, actions }: StatementResultCardProps) {
  const { statement, kind, status, columns, rows, rowCount, truncated, elapsedMs } = result;
  const available = (actions ?? []).filter((action) => action.isAvailable(result));

  return (
    <Panel
      className="statement-card"
      color="default"
      orientation="vertical"
      gap="none"
      padding="none"
      radii="md"
      hasBorder
      fillWidth
    >
      <Container orientation="horizontal" alignItems="center" gap="sm" padding="sm" fillWidth>
        <Text size="sm" weight="medium" color="muted">{`#${index + 1}`}</Text>
        <code className="statement-card__sql" title={statement}>
          {statement}
        </code>
        <div className="statement-card__meta">
          <Badge size="sm" state={status === 'error' ? 'danger' : 'success'} text={status} />
          {status === 'success' && (
            <Text size="sm" color="muted">
              {metricsLabel(kind, rowCount, truncated, elapsedMs)}
            </Text>
          )}
          {available.length > 0 && (
            <div className="statement-card__actions">
              {available.map((action) => (
                <IconButton
                  key={action.id}
                  icon={action.icon}
                  type="ghost"
                  size="sm"
                  title={action.label}
                  onClick={() => action.run(result, index)}
                />
              ))}
            </div>
          )}
        </div>
      </Container>
      <Separator size="xs" />
      <Container padding="sm" fillWidth isOverflowScroll>
        {status === 'error' ? (
          // ClickHouse echoes the SQL in its errors (the statement is already shown above), so the
          // message is cleaned (DL-034); the wrapper caps height so a still-long one scrolls.
          <div className="statement-card__error">
            <ErrorBanner title="Statement failed" message={formatClickHouseError(result.error?.message)} />
          </div>
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

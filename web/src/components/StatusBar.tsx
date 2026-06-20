import { memo } from 'react';
import { Badge, Panel, Text } from '@clickhouse/click-ui';
import type { RunState } from '../hooks/useRunQuery';

// Pure status line: a Click UI Panel strip (muted surface) with a Badge for the run state and
// Text for the summary (DL-017).
export interface StatusBarProps {
  state: RunState;
}

type BadgeState = 'neutral' | 'info' | 'success' | 'danger';

const STATUS_BADGE: Record<RunState['status'], { state: BadgeState; label: string }> = {
  idle: { state: 'neutral', label: 'Ready' },
  running: { state: 'info', label: 'Running' },
  done: { state: 'success', label: 'Done' },
  error: { state: 'danger', label: 'Error' },
};

function summarize(state: RunState): string {
  switch (state.status) {
    case 'idle':
      return 'Run a query to get started.';
    case 'running':
      return 'Executing…';
    case 'error':
      return 'Request failed.';
    case 'done': {
      const total = state.data.statements.length;
      const failed = state.data.statements.filter((statement) => statement.status === 'error').length;
      const ok = total - failed;
      const base = `${total} statement${total === 1 ? '' : 's'} · ${ok} ok`;
      return failed > 0 ? `${base} · ${failed} failed` : base;
    }
  }
}

function StatusBarComponent({ state }: StatusBarProps) {
  const badge = STATUS_BADGE[state.status];
  return (
    <Panel
      orientation="horizontal"
      alignItems="center"
      gap="sm"
      color="muted"
      radii="none"
      padding="xs"
      fillWidth
    >
      <Badge size="sm" state={badge.state} text={badge.label} />
      <Text size="sm" color="muted">
        {summarize(state)}
      </Text>
    </Panel>
  );
}

export const StatusBar = memo(StatusBarComponent);

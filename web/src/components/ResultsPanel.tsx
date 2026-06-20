import { memo } from 'react';
import { Container, Text } from '@clickhouse/click-ui';
import type { RunState } from '../hooks/useRunQuery';
import { StatementResultCard } from './StatementResultCard';
import { ErrorBanner } from './ErrorBanner';

// Pure results pane. Renders every async state explicitly (DL-004) — idle/running/error/done —
// using Click UI Container for layout (DL-017) so spacing/structure come from the design system.
export interface ResultsPanelProps {
  state: RunState;
}

function ResultsPanelComponent({ state }: ResultsPanelProps) {
  switch (state.status) {
    case 'idle':
      return (
        <Container padding="md">
          <Text color="muted">Run a query to see results here.</Text>
        </Container>
      );
    case 'running':
      return (
        <Container padding="md">
          <Text color="muted">Running…</Text>
        </Container>
      );
    case 'error':
      return (
        <Container padding="md" fillWidth>
          <ErrorBanner title="Request failed" message={state.message} />
        </Container>
      );
    case 'done': {
      const { statements } = state.data;
      if (statements.length === 0) {
        return (
          <Container padding="md">
            <Text color="muted">No statements to run.</Text>
          </Container>
        );
      }
      // Backend stops at the first error and omits later statements (DL-004); flag that.
      const stoppedEarly = statements[statements.length - 1].status === 'error';
      return (
        <Container orientation="vertical" gap="md" padding="md" fillWidth>
          {statements.map((result, index) => (
            <StatementResultCard key={index} result={result} index={index} />
          ))}
          {stoppedEarly && (
            <Text size="sm" color="warning">
              Execution stopped at the first error — any later statements were not run.
            </Text>
          )}
        </Container>
      );
    }
  }
}

export const ResultsPanel = memo(ResultsPanelComponent);

import { memo } from 'react';
import { Button } from '@clickhouse/click-ui';

// Pure Run/Cancel control. While a query is running it flips to a Cancel affordance, wiring the
// AbortController teardown to a single obvious button (DL-004 — explicit async affordances).
export interface RunButtonProps {
  isRunning: boolean;
  disabled?: boolean;
  onRun: () => void;
  onCancel: () => void;
}

function RunButtonComponent({ isRunning, disabled, onRun, onCancel }: RunButtonProps) {
  if (isRunning) {
    return <Button type="danger" label="Cancel" onClick={onCancel} />;
  }
  return <Button type="primary" label="Run" onClick={onRun} disabled={disabled} />;
}

export const RunButton = memo(RunButtonComponent);

import { memo, type ReactNode } from 'react';

// Pure presentational toolbar/header. Action controls (Run/Cancel, plugin toolbar actions)
// are injected via `actions` so the toolbar stays free of business logic and the plugin
// system can contribute to it later (DL-006).
export interface ToolbarProps {
  actions?: ReactNode;
}

function ToolbarComponent({ actions }: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__logo" aria-hidden="true" />
        <span className="toolbar__title">ClickHouse SQL Editor</span>
      </div>
      {actions ? <div className="toolbar__actions">{actions}</div> : null}
    </header>
  );
}

export const Toolbar = memo(ToolbarComponent);

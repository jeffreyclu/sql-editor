import type { ReactNode } from 'react';
import type { IconName } from '@clickhouse/click-ui';

// Editor plugins are how optional features (Examples now; History, Saved queries, future file
// import) attach to the editor without modifying its core — open/closed (DL-006). The interface
// is intentionally minimal (DL-008): a toolbar entry plus a panel. Extra contribution points
// (CodeMirror extensions, commands) get added when a plugin actually needs them.

/** What a plugin can do to the editor it's attached to. */
export interface PluginContext {
  /** Replace the editor document (e.g. load an example or a saved query). */
  setDoc: (doc: string) => void;
  /** Read the current editor document (e.g. to save it). */
  getDoc: () => string;
  /** Run a query immediately (e.g. re-run a history entry). */
  run: (query: string) => void;
}

export interface EditorPlugin {
  id: string;
  /** Tooltip + aria-label on the activity-rail toggle. */
  toolbarLabel: string;
  /** Click UI icon for the activity-rail toggle (DL-026). */
  icon: IconName;
  /** Panel heading. */
  title: string;
  /** Which rail/panel the plugin attaches to; default `'left'` (DL-026). */
  placement?: 'left' | 'right';
  /** Renders the plugin's panel; `close` dismisses it (e.g. after a selection). */
  renderPanel: (ctx: PluginContext, close: () => void) => ReactNode;
}

import type { ReactNode } from 'react';

// Editor plugins are how optional features (Examples now; History, Saved queries, future file
// import) attach to the editor without modifying its core — open/closed (DL-006). The interface
// is intentionally minimal (DL-008): a toolbar entry plus a panel. Extra contribution points
// (CodeMirror extensions, commands) get added when a plugin actually needs them.

/** What a plugin can do to the editor it's attached to. */
export interface PluginContext {
  /** Replace the editor document (e.g. load an example or a saved query). */
  setDoc: (doc: string) => void;
  /** Run a query immediately (e.g. re-run a history entry). */
  run: (query: string) => void;
}

export interface EditorPlugin {
  id: string;
  /** Toolbar button label that opens the plugin's panel. */
  toolbarLabel: string;
  /** Panel/flyout heading. */
  title: string;
  /** Renders the plugin's panel; `close` dismisses the flyout (e.g. after a selection). */
  renderPanel: (ctx: PluginContext, close: () => void) => ReactNode;
}

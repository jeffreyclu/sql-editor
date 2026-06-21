import { useMemo } from 'react';
import { Container, IconButton, Panel, Text } from '@clickhouse/click-ui';
import { usePlugins } from '../plugins/PluginProvider';
import type { PluginContext } from '../plugins/types';
import { useEditorActions } from '../state/EditorProvider';
import { useQuery } from '../state/QueryProvider';

// Container: renders the active editor plugin's panel as an in-flow side rail (no overlay/portal —
// just a Click UI Panel in the layout, so it renders reliably). Builds the PluginContext
// (setDoc/run) the plugin acts through.
export interface PluginPanelProps {
  pluginId: string;
  /** Which edge the panel docks to; drives its border side (DL-026). Default `'left'`. */
  placement?: 'left' | 'right';
  onClose: () => void;
}

export function PluginPanel({ pluginId, placement = 'left', onClose }: PluginPanelProps) {
  const plugins = usePlugins();
  const { setDoc, getDoc } = useEditorActions();
  const { run } = useQuery();

  const plugin = plugins.find((candidate) => candidate.id === pluginId);
  const ctx = useMemo<PluginContext>(() => ({ setDoc, getDoc, run }), [setDoc, getDoc, run]);

  if (!plugin) return null;

  // Collapse toward the edge the panel is docked to: a left panel collapses left, a right one right.
  const collapseIcon = placement === 'right' ? 'chevron-right' : 'chevron-left';

  return (
    <Panel
      className={`plugin-panel plugin-panel--${placement}`}
      color="muted"
      orientation="vertical"
      gap="sm"
      padding="sm"
      fillHeight
    >
      <Container
        orientation="horizontal"
        justifyContent="space-between"
        alignItems="center"
        fillWidth
      >
        <Text weight="medium">{plugin.title}</Text>
        <IconButton
          icon={collapseIcon}
          type="ghost"
          size="sm"
          aria-label="Collapse panel"
          onClick={onClose}
        />
      </Container>
      {plugin.renderPanel(ctx, onClose)}
    </Panel>
  );
}

import { Button } from '@clickhouse/click-ui';
import { usePlugins } from '../plugins/PluginProvider';

// Container: a toolbar toggle button per registered editor plugin (DL-006). Clicking toggles the
// in-layout PluginPanel; the active plugin is reflected by the primary-styled button.
export interface PluginBarProps {
  openId: string | null;
  onToggle: (id: string) => void;
}

export function PluginBar({ openId, onToggle }: PluginBarProps) {
  const plugins = usePlugins();
  return (
    <>
      {plugins.map((plugin) => (
        <Button
          key={plugin.id}
          type={openId === plugin.id ? 'primary' : 'secondary'}
          label={plugin.toolbarLabel}
          onClick={() => onToggle(plugin.id)}
        />
      ))}
    </>
  );
}

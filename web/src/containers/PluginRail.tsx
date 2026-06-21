import { IconButton, Tooltip } from '@clickhouse/click-ui';
import { usePlugins } from '../plugins/PluginProvider';

// Container: an icon activity-rail of plugin toggles for one side (DL-026). Each plugin is a compact
// Click UI IconButton (ghost; primary when active) with a tooltip + aria-pressed/aria-expanded.
// (Click UI's IconButton forces aria-label to the icon name — DL-026's aria-label=toolbarLabel
// isn't achievable with it — so the human label comes from the tooltip.) Renders nothing when no
// plugin targets this side, so the right rail only appears once a right-placement plugin exists.
export interface PluginRailProps {
  placement: 'left' | 'right';
  openId: string | null;
  onToggle: (id: string) => void;
}

export function PluginRail({ placement, openId, onToggle }: PluginRailProps) {
  const plugins = usePlugins().filter((plugin) => (plugin.placement ?? 'left') === placement);
  if (plugins.length === 0) {
    return null;
  }

  return (
    <nav className={`plugin-rail plugin-rail--${placement}`} aria-label={`${placement} panels`}>
      {plugins.map((plugin) => {
        const active = openId === plugin.id;
        return (
          <Tooltip key={plugin.id}>
            <Tooltip.Trigger>
              <IconButton
                icon={plugin.icon}
                type={active ? 'primary' : 'ghost'}
                aria-pressed={active}
                aria-expanded={active}
                onClick={() => onToggle(plugin.id)}
              />
            </Tooltip.Trigger>
            <Tooltip.Content side={placement === 'left' ? 'right' : 'left'}>
              {plugin.toolbarLabel}
            </Tooltip.Content>
          </Tooltip>
        );
      })}
    </nav>
  );
}

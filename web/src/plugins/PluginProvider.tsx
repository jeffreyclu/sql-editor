import { createContext, useContext, type ReactNode } from 'react';
import type { EditorPlugin } from './types';

// Holds the registered editor plugins (DL-006). Plugins are supplied at composition time, so the
// set is explicit and easy to swap in tests. Read via `usePlugins()`.
const PluginsContext = createContext<readonly EditorPlugin[] | null>(null);

export function PluginProvider({
  plugins,
  children,
}: {
  plugins: readonly EditorPlugin[];
  children: ReactNode;
}) {
  return <PluginsContext.Provider value={plugins}>{children}</PluginsContext.Provider>;
}

export function usePlugins(): readonly EditorPlugin[] {
  const plugins = useContext(PluginsContext);
  if (!plugins) throw new Error('usePlugins must be used within a <PluginProvider>.');
  return plugins;
}

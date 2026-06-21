import { useCallback, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { EditorPane } from './containers/EditorPane';
import { RunControls } from './containers/RunControls';
import { ResultsRegion } from './containers/ResultsRegion';
import { ThemeSwitcher } from './containers/ThemeSwitcher';
import { PluginBar } from './containers/PluginBar';
import { PluginPanel } from './containers/PluginPanel';

// Composition root: lays out the app shell and wires containers into it. The only state here is
// which plugin panel (if any) is open — an infrequent toggle, kept simple as local state.
export function App() {
  const [openPluginId, setOpenPluginId] = useState<string | null>(null);
  const togglePlugin = useCallback(
    (id: string) => setOpenPluginId((current) => (current === id ? null : id)),
    [],
  );
  const closePlugin = useCallback(() => setOpenPluginId(null), []);

  return (
    <div className="app-shell">
      <Toolbar
        actions={
          <>
            <PluginBar openId={openPluginId} onToggle={togglePlugin} />
            <ThemeSwitcher />
            <RunControls />
          </>
        }
      />
      <div className="app-main">
        {openPluginId ? <PluginPanel pluginId={openPluginId} onClose={closePlugin} /> : null}
        <main className="app-body">
          <section className="pane pane--editor" aria-label="SQL editor">
            <EditorPane />
          </section>
          <ResultsRegion />
        </main>
      </div>
    </div>
  );
}

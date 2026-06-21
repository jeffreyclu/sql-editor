import { useCallback, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { EditorPane } from './containers/EditorPane';
import { RunControls } from './containers/RunControls';
import { ResultsRegion } from './containers/ResultsRegion';
import { ThemeSwitcher } from './containers/ThemeSwitcher';
import { PluginRail } from './containers/PluginRail';
import { PluginPanel } from './containers/PluginPanel';

// Composition root. Plugin toggles live in a left icon activity-rail (DL-026); clicking one opens
// its panel beside the editor. The `placement` seam means a right rail/panel can be added later for
// inspection plugins without reworking this. Only state here is which plugin panel is open.
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
            <ThemeSwitcher />
            <RunControls />
          </>
        }
      />
      <div className="app-main">
        <PluginRail placement="left" openId={openPluginId} onToggle={togglePlugin} />
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

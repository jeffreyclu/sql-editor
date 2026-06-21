import { useCallback, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { EditorPane } from './containers/EditorPane';
import { RunControls } from './containers/RunControls';
import { ResultsRegion } from './containers/ResultsRegion';
import { ThemeSwitcher } from './containers/ThemeSwitcher';
import { PluginRail } from './containers/PluginRail';
import { PluginPanel } from './containers/PluginPanel';

// Composition root. Plugin toggles live in icon activity-rails on both edges (DL-026): "source"
// plugins (Examples/History/Saved) toggle a left panel; "inspection" plugins (Schema/DL-025) toggle
// a right panel. Each side has its own open-state, so a left source and a right detail can show
// simultaneously (DL-026). App holds only which panel is open per side.
export function App() {
  const [leftPluginId, setLeftPluginId] = useState<string | null>(null);
  const [rightPluginId, setRightPluginId] = useState<string | null>(null);

  const toggleLeft = useCallback(
    (id: string) => setLeftPluginId((current) => (current === id ? null : id)),
    [],
  );
  const toggleRight = useCallback(
    (id: string) => setRightPluginId((current) => (current === id ? null : id)),
    [],
  );
  const closeLeft = useCallback(() => setLeftPluginId(null), []);
  const closeRight = useCallback(() => setRightPluginId(null), []);

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
        <PluginRail placement="left" openId={leftPluginId} onToggle={toggleLeft} />
        {leftPluginId ? (
          <PluginPanel pluginId={leftPluginId} placement="left" onClose={closeLeft} />
        ) : null}
        <main className="app-body">
          <section className="pane pane--editor" aria-label="SQL editor">
            <EditorPane />
          </section>
          <ResultsRegion />
        </main>
        {rightPluginId ? (
          <PluginPanel pluginId={rightPluginId} placement="right" onClose={closeRight} />
        ) : null}
        <PluginRail placement="right" openId={rightPluginId} onToggle={toggleRight} />
      </div>
    </div>
  );
}

import { Toolbar } from './components/Toolbar';
import { EditorPane } from './containers/EditorPane';
import { RunControls } from './containers/RunControls';
import { ResultsRegion } from './containers/ResultsRegion';
import { ThemeSwitcher } from './containers/ThemeSwitcher';

// Composition root: lays out the app shell and wires container components into it. App reads no
// state itself, so it never re-renders; each container subscribes to its own provider, keeping
// re-renders isolated (DL-010/DL-019).
export function App() {
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
      <main className="app-body">
        <section className="pane pane--editor" aria-label="SQL editor">
          <EditorPane />
        </section>
        <ResultsRegion />
      </main>
    </div>
  );
}

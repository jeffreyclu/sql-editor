import { EditorSurface } from '../components/EditorSurface';
import { useEditorActions, useEditorDoc } from '../state/EditorProvider';
import { useTheme } from '../state/ThemeProvider';

// Container: connects the editor document and theme to the pure EditorSurface. This is the only
// component that subscribes to the high-frequency `doc`, so typing re-renders just the editor
// (DL-010). Connected components live in containers/; components/ stays pure (DL-005).
export function EditorPane() {
  const doc = useEditorDoc();
  const { setDoc } = useEditorActions();
  const { theme } = useTheme();

  return <EditorSurface value={doc} onChange={setDoc} theme={theme} />;
}

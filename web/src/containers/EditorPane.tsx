import { useCallback } from 'react';
import { IconButton } from '@clickhouse/click-ui';
import { EditorSurface } from '../components/EditorSurface';
import { useEditorActions, useEditorDoc } from '../state/EditorProvider';
import { useTheme } from '../state/ThemeProvider';

// Container: connects the editor document and theme to the pure EditorSurface, with copy/clear
// actions floated in the editor's top-right corner (no dedicated toolbar strip). This is the only
// component that subscribes to the high-frequency `doc`, so typing re-renders just the editor
// (DL-010). Connected components live in containers/ (DL-005).
export function EditorPane() {
  const doc = useEditorDoc();
  const { setDoc, getDoc } = useEditorActions();
  const { theme } = useTheme();

  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(getDoc());
  }, [getDoc]);

  return (
    <div className="editor-pane">
      <div className="editor-pane__actions">
        <IconButton icon="copy" type="ghost" size="sm" title="Copy query" onClick={handleCopy} />
        <IconButton
          icon="cross"
          type="ghost"
          size="sm"
          title="Clear editor"
          onClick={() => setDoc('')}
        />
      </div>
      <EditorSurface value={doc} onChange={setDoc} theme={theme} />
    </div>
  );
}

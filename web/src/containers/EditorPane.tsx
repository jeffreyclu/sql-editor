import { useCallback } from 'react';
import { IconButton } from '@clickhouse/click-ui';
import { EditorSurface } from '../components/EditorSurface';
import { useEditorActions, useEditorDoc } from '../state/EditorProvider';
import { useTheme } from '../state/ThemeProvider';
import { useToast } from '../hooks/useToast';

// Container: connects the editor document and theme to the pure EditorSurface, with copy/clear
// actions floated in the editor's top-right corner. Both confirm via a toast (DL-027); clear is
// destructive, so its toast offers Undo. Only this component subscribes to the high-frequency
// `doc`, so typing re-renders just the editor (DL-010).
export function EditorPane() {
  const doc = useEditorDoc();
  const { setDoc, getDoc } = useEditorActions();
  const { theme } = useTheme();
  const toast = useToast();

  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(getDoc()).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Could not copy the query'),
    );
  }, [getDoc, toast]);

  const handleClear = useCallback(() => {
    const previous = getDoc();
    if (previous.length === 0) {
      return;
    }
    setDoc('');
    toast.show({
      type: 'default',
      title: 'Editor cleared',
      actions: [
        { label: 'Undo', altText: 'Restore the cleared query', onClick: () => setDoc(previous) },
      ],
    });
  }, [getDoc, setDoc, toast]);

  return (
    <div className="editor-pane">
      <div className="editor-pane__actions">
        <IconButton icon="copy" type="ghost" size="sm" title="Copy query" onClick={handleCopy} />
        <IconButton icon="cross" type="ghost" size="sm" title="Clear editor" onClick={handleClear} />
      </div>
      <EditorSurface value={doc} onChange={setDoc} theme={theme} />
    </div>
  );
}

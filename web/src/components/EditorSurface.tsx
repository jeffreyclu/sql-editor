import { memo, useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import type { Extension } from '@codemirror/state';

// Pure, presentational CodeMirror surface (DL-002 — Click UI has no editor, DL-017). It holds no
// business logic: the document, change handler and theme are passed in. CodeMirror has its own
// theming (independent of Click UI), so `theme` drives the editor's light/dark appearance.
export interface EditorSurfaceProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  theme?: 'light' | 'dark';
}

function EditorSurfaceComponent({
  value,
  onChange,
  height = '100%',
  theme = 'light',
}: EditorSurfaceProps) {
  // `lineWrapping` so long SQL lines wrap instead of overflowing horizontally.
  const extensions = useMemo<Extension[]>(() => [sql(), EditorView.lineWrapping], []);

  return (
    <CodeMirror
      className="editor-surface"
      value={value}
      height={height}
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
    />
  );
}

export const EditorSurface = memo(EditorSurfaceComponent);

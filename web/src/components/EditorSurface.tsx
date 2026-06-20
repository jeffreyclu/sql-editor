import { memo, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import type { Extension } from '@codemirror/state';

// Pure, presentational CodeMirror surface (DL-002 — Click UI has no editor, DL-017). It
// holds no business logic: the document and change handler are passed in. Plugins can
// contribute additional CodeMirror extensions (the low-level plugin seam — DL-006), e.g. a
// Cmd/Ctrl+Enter run keymap or schema-aware autocomplete.
export interface EditorSurfaceProps {
  value: string;
  onChange: (value: string) => void;
  extensions?: readonly Extension[];
  height?: string;
}

function EditorSurfaceComponent({
  value,
  onChange,
  extensions,
  height = '100%',
}: EditorSurfaceProps) {
  const allExtensions = useMemo<Extension[]>(
    () => [sql(), ...(extensions ?? [])],
    [extensions],
  );

  return (
    <CodeMirror
      value={value}
      height={height}
      extensions={allExtensions}
      onChange={onChange}
      basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
    />
  );
}

export const EditorSurface = memo(EditorSurfaceComponent);

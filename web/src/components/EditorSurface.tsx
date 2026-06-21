import { memo, useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import type { Extension } from '@codemirror/state';

// Pure, presentational CodeMirror surface (DL-002 — Click UI has no editor, DL-017). It holds no
// business logic: the document, change handler, theme and (optional) autocomplete schema are passed
// in. CodeMirror has its own theming (independent of Click UI), so `theme` drives the editor's
// light/dark appearance. `schema` is the table → column-names map `sql({ schema })` consumes for
// schema-aware autocomplete (DL-025); the container derives it from the cached `useSchema` query.
export interface EditorSurfaceProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  theme?: 'light' | 'dark';
  /** Table name → column names, for schema-aware autocomplete (DL-025). */
  schema?: Record<string, string[]>;
}

function EditorSurfaceComponent({
  value,
  onChange,
  height = '100%',
  theme = 'light',
  schema,
}: EditorSurfaceProps) {
  // `lineWrapping` so long SQL lines wrap instead of overflowing horizontally. `sql({ schema })`
  // adds table/column autocompletion when a schema is provided (DL-025).
  const extensions = useMemo<Extension[]>(
    () => [sql(schema ? { schema } : undefined), EditorView.lineWrapping],
    [schema],
  );

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

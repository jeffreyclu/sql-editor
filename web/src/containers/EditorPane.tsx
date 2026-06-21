import { useCallback, useMemo } from 'react';
import { IconButton } from '@clickhouse/click-ui';
import { EditorSurface } from '../components/EditorSurface';
import { useEditorActions, useEditorDoc } from '../state/EditorProvider';
import { useTheme } from '../state/ThemeProvider';
import { useToast } from '../hooks/useToast';
import { useSchema } from '../hooks/useSchema';
import type { SchemaTree } from '../api/schema';

// Container: connects the editor document, theme and autocomplete schema to the pure EditorSurface,
// with copy/clear actions floated in the editor's bottom-right corner. Both confirm via a toast
// (DL-027); clear is destructive, so its toast offers Undo. Only this component subscribes to the
// high-frequency `doc`, so typing re-renders just the editor (DL-010). The schema comes from the
// same cached `useSchema` query the explorer panel uses (DL-025), reshaped for `sql({ schema })`.
export function EditorPane() {
  const doc = useEditorDoc();
  const { setDoc, getDoc } = useEditorActions();
  const { theme } = useTheme();
  const toast = useToast();
  const { data: schemaTree } = useSchema();
  const schema = useMemo(() => toAutocompleteSchema(schemaTree), [schemaTree]);

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
      <EditorSurface value={doc} onChange={setDoc} theme={theme} schema={schema} />
    </div>
  );
}

/**
 * Reshape the schema tree into the `{ [table]: string[] }` map `sql({ schema })` expects (DL-025).
 * Tables appear both unqualified (`events`) and qualified (`db.events`) so completion works either
 * way. Returns `undefined` when there's no schema yet, so the editor builds a plain `sql()`.
 */
function toAutocompleteSchema(tree: SchemaTree | undefined): Record<string, string[]> | undefined {
  if (!tree || tree.length === 0) {
    return undefined;
  }
  const schema: Record<string, string[]> = {};
  for (const database of tree) {
    for (const table of database.tables) {
      const columns = table.columns.map((column) => column.name);
      schema[table.name] = columns;
      schema[`${database.name}.${table.name}`] = columns;
    }
  }
  return schema;
}

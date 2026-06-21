import { useState } from 'react';
import { CardHorizontal, Container, IconButton, Text, TextField } from '@clickhouse/click-ui';
import type { EditorPlugin, PluginContext } from './types';
import { useDeleteSavedQuery, useSaveQuery, useSavedQueries } from '../hooks/useSavedQueries';

// The Saved queries plugin (DL-006 / DL-013): save the current editor script under a name, then
// load saved queries back (TanStack useQuery + save/delete mutations — DL-020).
export const saveQueryPlugin: EditorPlugin = {
  id: 'saved',
  toolbarLabel: 'Saved',
  icon: 'star',
  title: 'Saved queries',
  renderPanel: (ctx) => <SavedQueriesPanel ctx={ctx} />,
};

function SavedQueriesPanel({ ctx }: { ctx: PluginContext }) {
  const [name, setName] = useState('');
  const { data, isPending, isError } = useSavedQueries();
  const saveQuery = useSaveQuery();
  const deleteQuery = useDeleteSavedQuery();

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && ctx.getDoc().trim().length > 0 && !saveQuery.isPending;

  const handleSave = () => {
    // Re-read the live doc at click time: the disabled state is a best-effort render-time check, but
    // the panel doesn't subscribe to the editor doc, so guard the action freshly here (R8 note).
    const sql = ctx.getDoc();
    if (trimmedName.length === 0 || sql.trim().length === 0 || saveQuery.isPending) {
      return;
    }
    saveQuery.mutate({ name: trimmedName, sql }, { onSuccess: () => setName('') });
  };

  return (
    <Container orientation="vertical" gap="lg" fillWidth>
      <Container orientation="horizontal" gap="xs" alignItems="center" fillWidth>
        <Container grow="1" fillWidth>
          <TextField
            value={name}
            onChange={(value) => setName(value)}
            placeholder="Name this query"
          />
        </Container>
        <IconButton
          icon="disk"
          type="ghost"
          title="Save current query"
          disabled={!canSave}
          onClick={handleSave}
        />
      </Container>

      {isPending ? (
        <Text color="muted">Loading…</Text>
      ) : isError ? (
        <Text color="danger">Couldn’t load saved queries.</Text>
      ) : data.length === 0 ? (
        <Text color="muted">No saved queries yet — name one above and save.</Text>
      ) : (
        <Container orientation="vertical" gap="sm" fillWidth>
          {data.map((query) => (
            <Container key={query.id} orientation="horizontal" gap="xs" alignItems="center" fillWidth>
              <Container grow="1" fillWidth>
                <CardHorizontal
                  size="sm"
                  title={query.name}
                  description={firstLine(query.sql)}
                  onClick={() => ctx.setDoc(query.sql)}
                />
              </Container>
              <IconButton
                icon="trash"
                type="ghost"
                size="sm"
                title={`Delete ${query.name}`}
                onClick={() => deleteQuery.mutate(query.id)}
              />
            </Container>
          ))}
        </Container>
      )}
    </Container>
  );
}

function firstLine(sql: string): string {
  const line = sql.split('\n', 1)[0].trim();
  return line.length > 0 ? line : sql.trim();
}

import { useState } from 'react';
import { CardHorizontal, Container, IconButton, Text, TextField } from '@clickhouse/click-ui';
import type { EditorPlugin, PluginContext } from './types';
import {
  useDeleteSavedQuery,
  useSaveQuery,
  useSavedQueries,
  useUpdateSavedQuery,
} from '../hooks/useSavedQueries';
import type { SavedQuery } from '../api/types';
import { useToast } from '../hooks/useToast';

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
  const toast = useToast();

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && ctx.getDoc().trim().length > 0 && !saveQuery.isPending;

  const handleSave = () => {
    // Re-read the live doc at click time: the disabled state is a best-effort render-time check, but
    // the panel doesn't subscribe to the editor doc, so guard the action freshly here (R8 note).
    const sql = ctx.getDoc();
    if (trimmedName.length === 0 || sql.trim().length === 0 || saveQuery.isPending) {
      return;
    }
    saveQuery.mutate(
      { name: trimmedName, sql },
      {
        onSuccess: () => {
          setName('');
          toast.success('Query saved');
        },
        onError: () => toast.error('Could not save the query'),
      },
    );
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
            <SavedQueryRow key={query.id} query={query} ctx={ctx} />
          ))}
        </Container>
      )}
    </Container>
  );
}

// One saved-query row: normally a CardHorizontal (click to load); the pencil swaps it for an inline
// rename form (TextField + confirm/cancel). Rename is a TanStack mutation (DL-020) that invalidates
// the list on success; empty names are rejected and toasts confirm the outcome (DL-027).
function SavedQueryRow({ query, ctx }: { query: SavedQuery; ctx: PluginContext }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(query.name);
  const updateQuery = useUpdateSavedQuery();
  const deleteQuery = useDeleteSavedQuery();
  const toast = useToast();

  const trimmed = draft.trim();
  const canConfirm = trimmed.length > 0 && trimmed !== query.name && !updateQuery.isPending;

  const startEdit = () => {
    setDraft(query.name);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(query.name);
  };

  const confirmEdit = () => {
    if (!canConfirm) return;
    updateQuery.mutate(
      { id: query.id, changes: { name: trimmed } },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success('Query renamed');
        },
        onError: () => toast.error('Could not rename the query'),
      },
    );
  };

  if (editing) {
    return (
      <Container orientation="horizontal" gap="xs" alignItems="center" fillWidth>
        <Container grow="1" fillWidth>
          <TextField
            value={draft}
            onChange={(value) => setDraft(value)}
            placeholder="Rename query"
            onKeyUp={(e) => {
              if (e.key === 'Enter') confirmEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
          />
        </Container>
        <IconButton
          icon="check"
          type="ghost"
          size="sm"
          title="Save name"
          disabled={!canConfirm}
          onClick={confirmEdit}
        />
        <IconButton
          icon="cross"
          type="ghost"
          size="sm"
          title="Cancel rename"
          disabled={updateQuery.isPending}
          onClick={cancelEdit}
        />
      </Container>
    );
  }

  return (
    <Container orientation="horizontal" gap="xs" alignItems="center" fillWidth>
      <Container grow="1" fillWidth>
        <CardHorizontal
          size="sm"
          title={query.name}
          description={firstLine(query.sql)}
          onClick={() => ctx.setDoc(query.sql)}
        />
      </Container>
      <IconButton
        icon="pencil"
        type="ghost"
        size="sm"
        title={`Rename ${query.name}`}
        onClick={startEdit}
      />
      <IconButton
        icon="trash"
        type="ghost"
        size="sm"
        title={`Delete ${query.name}`}
        onClick={() =>
          deleteQuery.mutate(query.id, {
            onSuccess: () => toast.success('Query deleted'),
            onError: () => toast.error('Could not delete the query'),
          })
        }
      />
    </Container>
  );
}

function firstLine(sql: string): string {
  const line = sql.split('\n', 1)[0].trim();
  return line.length > 0 ? line : sql.trim();
}

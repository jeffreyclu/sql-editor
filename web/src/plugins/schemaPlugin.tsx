import { Accordion, Container, IconButton, Text } from '@clickhouse/click-ui';
import type { EditorPlugin, PluginContext } from './types';
import type { SchemaColumn, SchemaTable } from '../api/schema';
import { useSchema } from '../hooks/useSchema';

// The Schema explorer plugin (DL-025): a right-rail panel showing databases → tables → expandable
// columns over the cached `useSchema` query (the same query feeds CodeMirror autocomplete — DL-020).
// Clicking a table inserts its name into the editor. Data comes from the existing `POST /query`
// (system.columns) — no backend endpoint (DL-025). Same `renderPanel` shape as History/Saved.
// Placement is `'right'` — it's the inspection/detail side of the rail (DL-026), so it can show
// alongside a left "source" panel (Examples/History/Saved).
export const schemaPlugin: EditorPlugin = {
  id: 'schema',
  toolbarLabel: 'Schema',
  icon: 'database',
  title: 'Schema',
  placement: 'right',
  // Wrap the hook in a component so it isn't called conditionally from PluginPanel.
  renderPanel: (ctx) => <SchemaTreeView ctx={ctx} />,
};

function SchemaTreeView({ ctx }: { ctx: PluginContext }) {
  const { data, isPending, isError } = useSchema();

  if (isPending) {
    return <Text color="muted">Loading…</Text>;
  }
  if (isError) {
    return <Text color="danger">Couldn’t load schema.</Text>;
  }
  if (data.length === 0) {
    return <Text color="muted">No tables found.</Text>;
  }

  return (
    <Container orientation="vertical" gap="xs" fillWidth>
      {data.map((database) => (
        <Accordion key={database.name} title={database.name} icon="database" size="sm" fillWidth>
          {/* Click UI's Accordion doesn't indent its content, so an indent wrapper offsets the
              nested tables from the database row (the same is done for columns under a table). */}
          <div className="schema-tree__children">
            <Container orientation="vertical" gap="xs" fillWidth>
              {database.tables.map((table) => (
                <TableNode
                  key={table.name}
                  table={table}
                  onInsert={() => ctx.setDoc(appendIdentifier(ctx.getDoc(), table.name))}
                />
              ))}
            </Container>
          </div>
        </Accordion>
      ))}
    </Container>
  );
}

function TableNode({ table, onInsert }: { table: SchemaTable; onInsert: () => void }) {
  return (
    <Container orientation="horizontal" gap="xs" alignItems="center" fillWidth>
      <Container grow="1" fillWidth>
        <Accordion title={table.name} icon="table" size="sm" fillWidth>
          <div className="schema-tree__children">
            <Container orientation="vertical" gap="xs" fillWidth>
              {table.columns.map((column) => (
                <ColumnRow key={column.name} column={column} />
              ))}
            </Container>
          </div>
        </Accordion>
      </Container>
      <IconButton
        icon="insert-row"
        type="ghost"
        size="sm"
        title={`Insert ${table.name}`}
        onClick={onInsert}
      />
    </Container>
  );
}

function ColumnRow({ column }: { column: SchemaColumn }) {
  return (
    <Container orientation="horizontal" gap="xs" justifyContent="space-between" fillWidth>
      <Text size="sm" weight="mono">
        {column.name}
      </Text>
      <Text size="sm" color="muted">
        {column.type}
      </Text>
    </Container>
  );
}

/** Append an identifier to the current doc, separated by whitespace (simple, sensible — DL-025). */
function appendIdentifier(doc: string, identifier: string): string {
  if (doc.trim().length === 0) {
    return identifier;
  }
  return /\s$/.test(doc) ? `${doc}${identifier}` : `${doc} ${identifier}`;
}

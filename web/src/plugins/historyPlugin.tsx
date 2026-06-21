import { CardHorizontal, Container, Text } from '@clickhouse/click-ui';
import type { EditorPlugin, PluginContext } from './types';
import { useHistory } from '../hooks/useHistory';

// The History plugin (DL-006 / DL-013): a panel listing auto-logged runs (TanStack useQuery —
// DL-020). Each run is a compact, clickable Click UI CardHorizontal (SQL preview + timestamp +
// status badge); clicking loads its SQL back into the editor.
export const historyPlugin: EditorPlugin = {
  id: 'history',
  toolbarLabel: 'History',
  icon: 'history',
  title: 'Run history',
  // Wrap the hook in a component so it isn't called conditionally from PluginPanel.
  renderPanel: (ctx) => <HistoryList ctx={ctx} />,
};

function HistoryList({ ctx }: { ctx: PluginContext }) {
  const { data, isPending, isError } = useHistory();

  if (isPending) {
    return <Text color="muted">Loading…</Text>;
  }
  if (isError) {
    return <Text color="danger">Couldn’t load history.</Text>;
  }
  if (data.length === 0) {
    return <Text color="muted">No runs yet — run a query and it’ll show up here.</Text>;
  }

  return (
    <Container orientation="vertical" gap="sm" fillWidth>
      {data.map((entry) => (
        <CardHorizontal
          key={entry.id}
          size="sm"
          title={
            // Cap the SQL preview's height so a long (even single-line) query scrolls instead
            // of growing the card. orientation="vertical" + alignItems="start" so the text is
            // top-aligned, not vertically centered — Click UI's Container defaults to a centering
            // horizontal flex, which clipped the top/bottom of a wrapped preview.
            <Container
              orientation="vertical"
              alignItems="start"
              maxHeight="4.5rem"
              overflow="auto"
              fillWidth
            >
              <Text size="sm" weight="mono">
                {firstLine(entry.sql)}
              </Text>
            </Container>
          }
          description={formatTime(entry.executedAt)}
          badgeText={entry.status}
          badgeState={entry.status === 'error' ? 'danger' : 'success'}
          onClick={() => ctx.setDoc(entry.sql)}
        />
      ))}
    </Container>
  );
}

function firstLine(sql: string): string {
  const line = sql.split('\n', 1)[0].trim();
  return line.length > 0 ? line : sql.trim();
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

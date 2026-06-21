import { Container, Text } from '@clickhouse/click-ui';
import type { EditorPlugin } from './types';
import { goldenQueries } from '../data/goldenQueries';

// The Examples plugin (DL-006): a panel listing the shared golden dataset (DL-016). Selecting an
// example loads it into the editor; the panel stays open so several can be tried in a row.
export const examplesPlugin: EditorPlugin = {
  id: 'examples',
  toolbarLabel: 'Examples',
  title: 'Example queries',
  renderPanel: (ctx) => (
    <Container orientation="vertical" gap="xs" fillWidth>
      {goldenQueries.map((query) => (
        <button
          key={query.id}
          type="button"
          className="example-item"
          onClick={() => ctx.setDoc(query.sql)}
        >
          <Text size="sm" weight="medium">
            {query.title}
          </Text>
          <Text size="xs" color="muted">
            {query.description}
          </Text>
        </button>
      ))}
    </Container>
  ),
};

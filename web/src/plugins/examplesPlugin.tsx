import { CardHorizontal, Container } from '@clickhouse/click-ui';
import type { EditorPlugin } from './types';
import { goldenQueries } from '../data/goldenQueries';

// The Examples plugin (DL-006): a panel of ready-to-run queries from the shared golden dataset
// (DL-016). Each is a Click UI CardHorizontal — a compact, bordered, clickable row; clicking loads
// the query into the editor.
export const examplesPlugin: EditorPlugin = {
  id: 'examples',
  toolbarLabel: 'Examples',
  title: 'Example queries',
  renderPanel: (ctx) => (
    <Container orientation="vertical" gap="sm" fillWidth>
      {goldenQueries.map((query) => (
        <CardHorizontal
          key={query.id}
          size="sm"
          title={query.title}
          description={query.description}
          onClick={() => ctx.setDoc(query.sql)}
        />
      ))}
    </Container>
  ),
};

import { Container } from '@clickhouse/click-ui';
import { ResultsPanel } from '../components/ResultsPanel';
import { StatusBar } from '../components/StatusBar';
import { useQuery } from '../state/QueryProvider';
import { resultActions } from '../plugins/resultActions';

// Container: connects run state to the results pane. Consuming only the query provider keeps typing
// in the editor from re-rendering results (DL-010). Result-pane actions (CSV export, …) come from
// the plugin registry (DL-006/DL-024) — the pane renders whatever applies, knowing nothing about
// any specific action.
//
// The scroll area is an explicitly vertical Container: the default Click UI Container is a
// horizontal flex with `align-items: center`, which vertically centers tall content and makes the
// overflow unreachable (results looked centered / cut off). `orientation="vertical"` flows results
// top-down with constant padding; `minHeight="0"` lets the flex child shrink so `overflow="auto"`
// actually scrolls. (Click UI's `isOverflowScroll` is a no-op in v0.6.1.)
export function ResultsRegion() {
  const { runState } = useQuery();
  return (
    <section className="pane pane--results" aria-label="Query results">
      <StatusBar state={runState} />
      <Container
        orientation="vertical"
        alignItems="start"
        grow="1"
        fillWidth
        minHeight="0"
        overflow="auto"
      >
        <ResultsPanel state={runState} resultActions={resultActions} />
      </Container>
    </section>
  );
}

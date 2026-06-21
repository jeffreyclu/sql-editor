import { Container } from '@clickhouse/click-ui';
import { ResultsPanel } from '../components/ResultsPanel';
import { StatusBar } from '../components/StatusBar';
import { useQuery } from '../state/QueryProvider';

// Container: connects run state to the results pane. Consuming only the query provider keeps
// typing in the editor from re-rendering results (DL-010). The scroll area needs minHeight="0" so
// the flex child can shrink below its content and `overflow="auto"` actually scrolls. (Click UI's
// `isOverflowScroll` prop is a no-op in v0.6.1 — the working knobs are `minHeight` + `overflow`,
// and `grow="1"` resolves to `flex: 1`.)
export function ResultsRegion() {
  const { runState } = useQuery();
  return (
    <section className="pane pane--results" aria-label="Query results">
      <StatusBar state={runState} />
      <Container grow="1" fillWidth minHeight="0" overflow="auto">
        <ResultsPanel state={runState} />
      </Container>
    </section>
  );
}

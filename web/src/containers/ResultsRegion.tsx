import { Container } from '@clickhouse/click-ui';
import { ResultsPanel } from '../components/ResultsPanel';
import { StatusBar } from '../components/StatusBar';
import { useQuery } from '../state/QueryProvider';

// Container: connects run state to the results pane. Consuming only the query provider keeps
// typing in the editor from re-rendering results (DL-010). The scroll area is a Click UI
// Container so overflow/sizing come from the design system (DL-017).
export function ResultsRegion() {
  const { runState } = useQuery();
  return (
    <section className="pane pane--results" aria-label="Query results">
      <StatusBar state={runState} />
      <Container grow="1" fillWidth isOverflowScroll>
        <ResultsPanel state={runState} />
      </Container>
    </section>
  );
}

import { useQuery } from '@tanstack/react-query';
import { HISTORY_QUERY_KEY, fetchHistory } from '../api/history';

// Run history as cached server state (DL-020). The run mutation invalidates HISTORY_QUERY_KEY,
// so the list refreshes after each run.
export function useHistory() {
  return useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: ({ signal }) => fetchHistory(signal),
  });
}

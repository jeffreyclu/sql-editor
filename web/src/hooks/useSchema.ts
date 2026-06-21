import { useQuery } from '@tanstack/react-query';
import { SCHEMA_QUERY_KEY, fetchSchema } from '../api/schema';

// Schema metadata as cached server state (DL-020/DL-025). One query feeds BOTH the schema-explorer
// panel and CodeMirror autocomplete, so the `system.columns` read happens once. Schema changes
// rarely, so we use a long `staleTime` (5 min) and don't refetch on mount/focus.
export function useSchema() {
  return useQuery({
    queryKey: SCHEMA_QUERY_KEY,
    queryFn: ({ signal }) => fetchSchema(signal),
    staleTime: 5 * 60_000,
  });
}

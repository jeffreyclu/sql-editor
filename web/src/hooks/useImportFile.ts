import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importFile } from '../api/import';
import { SCHEMA_QUERY_KEY } from '../api/schema';

// File import as a TanStack mutation (DL-020). Import inserts into a table and can now also create
// one (DL-033), so on success we invalidate the schema query — a freshly created table must show up
// in the explorer and the import table picker. `useMutation` already gives idle/pending/error/success
// states the plugin surfaces (disabled/loading) and drives the success/error toasts (DL-027).
export function useImportFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEMA_QUERY_KEY });
    },
  });
}

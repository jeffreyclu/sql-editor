import { useMutation } from '@tanstack/react-query';
import { importFile } from '../api/import';

// File import as a TanStack mutation (DL-020). Import is imperative and inserts into an existing
// table — the schema is unchanged and there's no list to refresh — so, unlike save/delete, this
// mutation invalidates nothing. `useMutation` already gives idle/pending/error/success states the
// plugin surfaces (disabled/loading) and drives the success/error toasts (DL-027).
export function useImportFile() {
  return useMutation({ mutationFn: importFile });
}

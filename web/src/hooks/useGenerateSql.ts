import { useMutation } from '@tanstack/react-query';
import { generateSql } from '../api/ai';

// NL→SQL generation as a TanStack mutation (DL-020/DL-031). Like the run-query mutation, this is
// imperative and **never cached** — each prompt is a one-off request, not a cacheable resource.
// `useMutation` already exposes the idle/pending/error states the plugin surfaces (disabled/loading
// + a friendly error). Mutations don't retry (the shared QueryClient default — main.tsx).
export function useGenerateSql() {
  return useMutation({ mutationFn: generateSql });
}

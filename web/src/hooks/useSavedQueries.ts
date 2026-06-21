import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SAVED_QUERIES_QUERY_KEY,
  createSavedQuery,
  deleteSavedQuery,
  fetchSavedQueries,
  updateSavedQuery,
} from '../api/savedQueries';
import type { NewSavedQuery } from '../api/types';

// Saved queries as cached server state (DL-020): a `useQuery` list plus save/delete mutations that
// invalidate it so the list stays in sync.

export function useSavedQueries() {
  return useQuery({
    queryKey: SAVED_QUERIES_QUERY_KEY,
    queryFn: ({ signal }) => fetchSavedQueries(signal),
  });
}

export function useSaveQuery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSavedQuery,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_QUERY_KEY }),
  });
}

export function useUpdateSavedQuery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<NewSavedQuery> }) =>
      updateSavedQuery(id, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_QUERY_KEY }),
  });
}

export function useDeleteSavedQuery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSavedQuery,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVED_QUERIES_QUERY_KEY }),
  });
}

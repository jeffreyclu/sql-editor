import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { apiClient as defaultApiClient, type ApiClient } from '../api/apiClient';
import { useRunQuery, type RunState } from '../hooks/useRunQuery';

// Lower-frequency query-execution state, kept in its own provider so it never shares a render
// path with the editor document (DL-010). Plain Context + `useState` (via useRunQuery), read
// through the thin `useQuery()` wrapper (DL-019).

export interface QueryContextValue {
  runState: RunState;
  run: (query: string) => void;
  cancel: () => void;
}

const QueryContext = createContext<QueryContextValue | null>(null);

export interface QueryProviderProps {
  children: ReactNode;
  /** Injectable for tests (DIP, DL-005). Defaults to the real same-origin HTTP client. */
  apiClient?: ApiClient;
}

export function QueryProvider({ children, apiClient = defaultApiClient }: QueryProviderProps) {
  const { runState, run, cancel } = useRunQuery(apiClient);
  const value = useMemo<QueryContextValue>(
    () => ({ runState, run, cancel }),
    [runState, run, cancel],
  );

  return <QueryContext.Provider value={value}>{children}</QueryContext.Provider>;
}

export function useQuery(): QueryContextValue {
  const context = useContext(QueryContext);
  if (!context) throw new Error('useQuery must be used within a <QueryProvider>.');
  return context;
}

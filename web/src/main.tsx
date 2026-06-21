import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './state/ThemeProvider';
import { EditorProvider } from './state/EditorProvider';
import { QueryProvider } from './state/QueryProvider';
import { PluginProvider } from './plugins/PluginProvider';
import { examplesPlugin } from './plugins/examplesPlugin';
import { historyPlugin } from './plugins/historyPlugin';
import { saveQueryPlugin } from './plugins/saveQueryPlugin';
import { schemaPlugin } from './plugins/schemaPlugin';
import { fileImportPlugin } from './plugins/fileImportPlugin';
import { aiAssistantPlugin } from './plugins/aiAssistantPlugin';
import { App } from './App';
import './styles.css';

// TanStack Query is the server-state layer (DL-020). Run-query is a mutation (uncached); future
// history/saved/schema reads are `useQuery` against this same client. Mutations don't retry.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

// Registered editor plugins (DL-006). Schema explorer (DL-025) + file import (DL-006) join the
// existing trio.
const plugins = [examplesPlugin, historyPlugin, saveQueryPlugin, schemaPlugin, fileImportPlugin, aiAssistantPlugin];

// Provider tree (outermost → innermost): theme + Click UI design system (DL-001/DL-017) →
// TanStack Query (server state, DL-020) → editor document (UI state, DL-010/DL-019) → query run
// → plugin registry.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <EditorProvider>
          <QueryProvider>
            <PluginProvider plugins={plugins}>
              <App />
            </PluginProvider>
          </QueryProvider>
        </EditorProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);

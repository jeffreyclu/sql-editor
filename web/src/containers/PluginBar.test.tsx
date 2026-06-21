import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { PluginBar } from './PluginBar';
import { PluginPanel } from './PluginPanel';
import { PluginProvider } from '../plugins/PluginProvider';
import { examplesPlugin } from '../plugins/examplesPlugin';
import { EditorProvider } from '../state/EditorProvider';
import { QueryProvider } from '../state/QueryProvider';
import { goldenQueries } from '../data/goldenQueries';

// Mirrors App's wiring: the toolbar button toggles an in-layout panel.
function Harness() {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <PluginBar openId={openId} onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))} />
      {openId ? <PluginPanel pluginId={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function renderHarness() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <ClickUIProvider theme="light">
      <QueryClientProvider client={queryClient}>
        <EditorProvider>
          <QueryProvider>
            <PluginProvider plugins={[examplesPlugin]}>
              <Harness />
            </PluginProvider>
          </QueryProvider>
        </EditorProvider>
      </QueryClientProvider>
    </ClickUIProvider>,
  );
}

describe('plugin panel', () => {
  it('opens the examples panel when the toolbar button is clicked', async () => {
    renderHarness();

    expect(screen.queryByText(goldenQueries[0].title)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Examples' }));

    expect(await screen.findByText(goldenQueries[0].title)).toBeInTheDocument();
  });
});

import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { PluginRail } from './PluginRail';
import { PluginPanel } from './PluginPanel';
import { PluginProvider } from '../plugins/PluginProvider';
import { examplesPlugin } from '../plugins/examplesPlugin';
import { EditorProvider } from '../state/EditorProvider';
import { QueryProvider } from '../state/QueryProvider';
import { goldenQueries } from '../data/goldenQueries';

// Mirrors App's wiring: a left icon-rail toggle opens its panel.
function Harness() {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <PluginRail
        placement="left"
        openId={openId}
        onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
      />
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

describe('plugin rail', () => {
  it('opens a plugin panel when its icon toggle is clicked', async () => {
    renderHarness();

    expect(screen.queryByText(goldenQueries[0].title)).not.toBeInTheDocument();

    // One toggle (Examples) in the rail; icon buttons carry no text, so click it via the rail nav.
    const rail = screen.getByRole('navigation', { name: 'left panels' });
    await userEvent.click(within(rail).getByRole('button'));

    expect(await screen.findByText(goldenQueries[0].title)).toBeInTheDocument();
  });
});

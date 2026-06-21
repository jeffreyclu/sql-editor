import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickUIProvider } from '@clickhouse/click-ui';
import { aiAssistantPlugin } from './aiAssistantPlugin';
import { SCHEMA_QUERY_KEY, type SchemaTree } from '../api/schema';
import type { PluginContext } from './types';

afterEach(() => vi.unstubAllGlobals());

// Seed the schema cache so the panel has a tree to pass along without a round-trip (the schema
// fetch/transform path is covered separately in schema.test.ts).
const schemaTree: SchemaTree = [
  { name: 'default', tables: [{ name: 'events', columns: [{ name: 'id', type: 'UInt64' }] }] },
];

function renderPanel(ctx: PluginContext) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(SCHEMA_QUERY_KEY, schemaTree);
  return render(
    <ClickUIProvider theme="light">
      <QueryClientProvider client={queryClient}>
        {aiAssistantPlugin.renderPanel(ctx, () => {})}
      </QueryClientProvider>
    </ClickUIProvider>,
  );
}

describe('aiAssistantPlugin', () => {
  it('is a left-placed plugin with an AI label and a valid sparkle icon', () => {
    expect(aiAssistantPlugin.id).toBe('ai');
    expect(aiAssistantPlugin.toolbarLabel).toBe('AI');
    expect(aiAssistantPlugin.icon).toBe('sparkle');
    expect(aiAssistantPlugin.placement).toBe('left');
  });

  it('generates SQL from the prompt and loads it into the editor (never auto-runs)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sql: 'SELECT count() FROM default.events',
        explanation: 'Counts all events.',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const setDoc = vi.fn();
    const run = vi.fn();
    renderPanel({ setDoc, getDoc: () => '', run });

    const generateButton = screen.getByRole('button', { name: /generate/i });
    expect(generateButton).toBeDisabled();

    // Click UI's TextAreaField wires its handler to `onInput` (not `onChange`), so fire an input event.
    fireEvent.input(screen.getByPlaceholderText(/top 10 users/i), {
      target: { value: 'how many events?' },
    });
    await waitFor(() => expect(generateButton).not.toBeDisabled());
    fireEvent.click(generateButton);

    await waitFor(() =>
      expect(setDoc).toHaveBeenCalledWith('SELECT count() FROM default.events'),
    );
    // Loaded into the editor, never executed (DL-031).
    expect(run).not.toHaveBeenCalled();

    // The POST carried the prompt and the cached schema.
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ai/sql');
    expect(JSON.parse(String(options.body))).toEqual({
      prompt: 'how many events?',
      schema: schemaTree,
    });

    // The explanation is surfaced.
    expect(await screen.findByText('Counts all events.')).toBeInTheDocument();
  });

  it('shows a friendly "set GEMINI_API_KEY" message on a 503 (not configured)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'AI assistant not configured' }),
      }),
    );

    const setDoc = vi.fn();
    renderPanel({ setDoc, getDoc: () => '', run: vi.fn() });

    const generateButton = screen.getByRole('button', { name: /generate/i });
    fireEvent.input(screen.getByPlaceholderText(/top 10 users/i), {
      target: { value: 'anything' },
    });
    await waitFor(() => expect(generateButton).not.toBeDisabled());
    fireEvent.click(generateButton);

    expect(await screen.findByText(/set GEMINI_API_KEY/i)).toBeInTheDocument();
    expect(setDoc).not.toHaveBeenCalled();
  });
});

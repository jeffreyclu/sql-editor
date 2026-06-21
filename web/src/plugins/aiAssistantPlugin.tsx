import { useState } from 'react';
import { Button, Container, Text, TextAreaField } from '@clickhouse/click-ui';
import type { EditorPlugin, PluginContext } from './types';
import { ApiError } from '../api/apiClient';
import { useGenerateSql } from '../hooks/useGenerateSql';
import { useSchema } from '../hooks/useSchema';

// The AI assistant plugin (DL-031): a panel where the user describes what they want in plain
// language and the backend LLM proxy (`POST /api/ai/sql`) generates SQL. The generated SQL is
// **loaded into the editor** (`ctx.setDoc`) for the user to review and Run — it is **never
// auto-run** (DL-031). The cached schema (`useSchema`, DL-025) is passed along so the SQL targets
// real tables/columns. Placement is `'left'` — it's a "source" panel like Examples/History/Saved
// (DL-026). The hooks live in a child component so they aren't called conditionally from
// PluginPanel (the same hook-safety pattern as the other plugins).
export const aiAssistantPlugin: EditorPlugin = {
  id: 'ai',
  toolbarLabel: 'AI',
  icon: 'sparkle',
  title: 'AI assistant',
  placement: 'left',
  renderPanel: (ctx) => <AiAssistantPanel ctx={ctx} />,
};

function AiAssistantPanel({ ctx }: { ctx: PluginContext }) {
  const [prompt, setPrompt] = useState('');
  const generate = useGenerateSql();
  // The schema is best-effort context: if it's still loading or failed, we still let the user
  // generate (the backend simply gets less context) rather than blocking the feature.
  const schema = useSchema();

  const trimmedPrompt = prompt.trim();
  const canGenerate = trimmedPrompt.length > 0 && !generate.isPending;

  const handleGenerate = () => {
    // Re-check at click time — the disabled state is a best-effort render guard (cf. saveQuery).
    if (trimmedPrompt.length === 0 || generate.isPending) {
      return;
    }
    generate.mutate(
      { prompt: trimmedPrompt, schema: schema.data },
      {
        // Load the generated SQL into the editor for review — NEVER auto-run (DL-031).
        onSuccess: (result) => ctx.setDoc(result.sql),
      },
    );
  };

  const result = generate.data;

  return (
    <Container orientation="vertical" gap="lg" fillWidth>
      <Container orientation="vertical" gap="xs" fillWidth>
        <Text size="sm" color="muted">
          Describe the query you want in plain language. The generated SQL loads into the editor for
          you to review and run.
        </Text>
        <TextAreaField
          value={prompt}
          onChange={(value) => setPrompt(value)}
          placeholder="e.g. top 10 users by total order value in the last 30 days"
          rows={4}
          disabled={generate.isPending}
        />
      </Container>

      <Button
        label={generate.isPending ? 'Generating…' : 'Generate'}
        iconLeft="sparkle"
        loading={generate.isPending}
        disabled={!canGenerate}
        onClick={handleGenerate}
      />

      {generate.isError && <ErrorMessage error={generate.error} />}

      {result?.explanation && (
        <Container orientation="vertical" gap="xs" fillWidth>
          <Text size="sm" color="muted">
            Explanation
          </Text>
          <Text size="sm">{result.explanation}</Text>
        </Container>
      )}
    </Container>
  );
}

// Turn a generation failure into a friendly message. Two cases get a tailored hint: a 503 means the
// server has no API key configured (DL-031), and a 429 means the free-tier rate limit was hit
// (DL-032). Everything else shows the backend's `{ error }` message verbatim.
function ErrorMessage({ error }: { error: unknown }) {
  return (
    <Text size="sm" color="danger">
      {messageForError(error)}
    </Text>
  );
}

function messageForError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) {
      return 'Set GEMINI_API_KEY on the server to enable the AI assistant.';
    }
    if (error.status === 429) {
      return 'Rate limit reached — try again in a moment.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Could not generate SQL.';
}

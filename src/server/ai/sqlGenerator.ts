import { GoogleGenAI, Type, type Schema } from '@google/genai';

/**
 * One database in the schema tree the frontend passes down (DL-031/DL-032). This wire shape is
 * the **FE↔BE contract** and must stay exactly in sync with the frontend's cached schema tree
 * (`useSchema`, DL-025) — do not reshape it here.
 */
export interface SchemaDatabase {
  name: string;
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string }>;
  }>;
}

/** The optional schema tree embedded into the prompt so generated SQL targets real tables. */
export type SchemaInput = SchemaDatabase[];

/** A natural-language → SQL generation request. */
export interface GenerateSqlInput {
  /** The user's natural-language prompt (already validated non-empty by the route). */
  prompt: string;
  /** The current schema tree, if the client has one cached, so SQL references real tables. */
  schema?: SchemaInput;
}

/** A generated query: the SQL plus an optional short explanation. */
export interface GeneratedSql {
  sql: string;
  explanation?: string;
}

/**
 * Narrow port over an LLM that turns natural language into SQL (ISP/DIP — mirrors
 * {@link import('../clickhouse').ClickHouseExecutor}, DL-005). Routes depend only on this
 * interface, so the provider is swappable and the route is testable with a fake (no API key
 * needed to build or test, DL-031/DL-032).
 */
export interface SqlGenerator {
  generate(input: GenerateSqlInput): Promise<GeneratedSql>;
}

/** Model id — a current, GA, free-tier Gemini (DL-032; verified against Google AI docs). */
export const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Gemini-native structured-output schema constraining the response to `{ sql, explanation? }`,
 * so we read reliable JSON instead of stripping prose out of free text (DL-031).
 */
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    sql: {
      type: Type.STRING,
      description: 'The generated SQL query (ClickHouse dialect). No markdown fences, just SQL.',
    },
    explanation: {
      type: Type.STRING,
      description: 'A short, one- or two-sentence explanation of what the query does.',
    },
  },
  required: ['sql'],
  propertyOrdering: ['sql', 'explanation'],
};

const SYSTEM_INSTRUCTION =
  'You are an expert ClickHouse SQL assistant. Translate the user\'s natural-language request ' +
  'into a single, valid ClickHouse SQL query. Prefer standard ClickHouse syntax and functions. ' +
  'Return only the SQL in the `sql` field (no markdown code fences) and a brief explanation in ' +
  '`explanation`. If a database schema is provided, reference only tables and columns that exist ' +
  'in it.';

/**
 * Render the schema tree into a compact textual catalog embedded in the prompt, so the model
 * targets real tables/columns. Kept terse to stay well within the free-tier token budget.
 */
export function formatSchemaForPrompt(schema: SchemaInput | undefined): string {
  if (!schema || schema.length === 0) {
    return 'No schema was provided; ask for clarification only if the request is ambiguous.';
  }

  const lines: string[] = ['Available schema (database.table — columns):'];
  for (const database of schema) {
    for (const table of database.tables) {
      const columns = table.columns.map((c) => `${c.name} ${c.type}`).join(', ');
      lines.push(`- ${database.name}.${table.name} (${columns})`);
    }
  }
  return lines.join('\n');
}

/** Build the user-content prompt: the request plus the rendered schema catalog. */
function buildPrompt({ prompt, schema }: GenerateSqlInput): string {
  return `${formatSchemaForPrompt(schema)}\n\nRequest: ${prompt}`;
}

/**
 * Production {@link SqlGenerator}: Google Gemini via the official `@google/genai` SDK
 * (`ai.models.generateContent` with a JSON `responseSchema` — verified against the installed
 * package types + Google AI docs). The `@google/genai` dependency is isolated to this file
 * (mirroring `@clickhouse/client` in `clickhouse.ts`).
 *
 * Reads `GEMINI_API_KEY` from the environment. The route is responsible for the graceful 503
 * when the key is unset (DL-031); this factory still defends against a missing key so a
 * misconfigured caller fails loudly rather than calling the SDK with an empty key.
 */
export function createGeminiSqlGenerator(
  apiKey: string | undefined = process.env.GEMINI_API_KEY,
): SqlGenerator {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const ai = new GoogleGenAI({ apiKey });

  return {
    async generate(input) {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildPrompt(input),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          // SQL generation is short + deterministic-leaning; keep randomness low.
          temperature: 0,
        },
      });

      return parseGeneratedSql(response.text);
    },
  };
}

/** Parse and validate the model's JSON response into a {@link GeneratedSql}. */
function parseGeneratedSql(text: string | undefined): GeneratedSql {
  if (!text) {
    throw new Error('The AI assistant returned an empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The AI assistant returned a malformed response');
  }

  const { sql, explanation } = (parsed ?? {}) as { sql?: unknown; explanation?: unknown };
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new Error('The AI assistant did not return any SQL');
  }

  return {
    sql: sql.trim(),
    explanation: typeof explanation === 'string' && explanation.trim() !== '' ? explanation.trim() : undefined,
  };
}

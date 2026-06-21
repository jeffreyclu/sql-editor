import { describe, expect, it } from 'vitest';
import {
  createGeminiSqlGenerator,
  formatSchemaForPrompt,
  type SchemaInput,
} from './sqlGenerator';

describe('formatSchemaForPrompt', () => {
  it('renders a catalog of database.table (columns) for the model', () => {
    const schema: SchemaInput = [
      {
        name: 'default',
        tables: [
          { name: 'events', columns: [{ name: 'id', type: 'UInt64' }, { name: 'ts', type: 'DateTime' }] },
        ],
      },
    ];

    const rendered = formatSchemaForPrompt(schema);

    expect(rendered).toContain('default.events (id UInt64, ts DateTime)');
  });

  it('falls back to a no-schema note when schema is absent or empty', () => {
    expect(formatSchemaForPrompt(undefined)).toMatch(/no schema/i);
    expect(formatSchemaForPrompt([])).toMatch(/no schema/i);
  });
});

describe('createGeminiSqlGenerator', () => {
  it('throws when no API key is available (defends a misconfigured caller)', () => {
    expect(() => createGeminiSqlGenerator(undefined)).toThrow(/GEMINI_API_KEY/);
  });

  it('constructs when an API key is provided (no network call)', () => {
    expect(() => createGeminiSqlGenerator('test-key')).not.toThrow();
  });
});

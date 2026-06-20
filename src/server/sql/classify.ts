import type { StatementKind } from '../types';

/**
 * Leading keywords that produce a result set in ClickHouse. These are routed to
 * `client.query` (JSON format → columns + rows + statistics); everything else is
 * routed to `client.command` (DDL/DML/SET/...). See DL-004.
 */
const DATA_RETURNING_KEYWORDS = new Set([
  'SELECT',
  'WITH',
  'SHOW',
  'DESCRIBE',
  'DESC',
  'EXPLAIN',
  'EXISTS',
]);

/**
 * Classify a single statement by its leading keyword.
 *
 * Unknown/empty statements default to `command`: `client.command` tolerates
 * statements that return no rows, whereas `client.query` does not, so this is the
 * safe fallback.
 */
export function classifyStatement(statement: string): StatementKind {
  return DATA_RETURNING_KEYWORDS.has(leadingKeyword(statement)) ? 'query' : 'command';
}

/**
 * Extract the upper-cased leading keyword of a statement, skipping leading
 * whitespace, line/block comments, and opening parentheses (e.g. `(SELECT ...)`).
 * Returns `''` when no keyword is found.
 */
export function leadingKeyword(statement: string): string {
  let rest = statement;

  // Repeatedly strip whatever can precede the first keyword until nothing changes.
  for (;;) {
    const before = rest;
    rest = rest.replace(/^\s+/, ''); // whitespace / newlines
    rest = rest.replace(/^--[^\n]*(?:\n|$)/, ''); // -- line comment
    rest = rest.replace(/^\/\*[\s\S]*?\*\//, ''); // block comment
    rest = rest.replace(/^\(+/, ''); // leading parentheses
    if (rest === before) {
      break;
    }
  }

  const match = rest.match(/^[A-Za-z_]+/);
  return match ? match[0].toUpperCase() : '';
}

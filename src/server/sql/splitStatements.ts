import { splitQuery, mysqlSplitterOptions } from 'dbgate-query-splitter';

/**
 * Split a multi-statement SQL script into individual statements (DL-003).
 *
 * Splitting SQL correctly means respecting string literals, line/block comments,
 * and semicolons that appear inside them. We delegate this to
 * `dbgate-query-splitter` using its MySQL preset — the closest match to
 * ClickHouse's lexical rules: backtick identifiers, single/double quoted strings
 * with both doubled (`''`) and backslash escaping, and `--` / slash-star comments.
 * No library certifies a ClickHouse dialect, so the edge cases are unit-tested.
 *
 * Comments are intentionally kept attached to their statement (ClickHouse accepts
 * leading comments); statement classification strips them when reading the keyword.
 *
 * @returns trimmed, non-empty statements in source order (empty array for blank input).
 */
export function splitStatements(sql: string): string[] {
  if (sql.trim() === '') {
    return [];
  }

  return splitQuery(sql, mysqlSplitterOptions)
    .map((item) => (typeof item === 'string' ? item : item.text))
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

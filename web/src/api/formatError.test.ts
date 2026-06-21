import { describe, expect, it } from 'vitest';
import { formatClickHouseError, truncateForToast } from './formatError';

describe('formatClickHouseError', () => {
  it('drops the version tag and the DB::Exception noise', () => {
    expect(
      formatClickHouseError(
        "Code: 60. DB::Exception: Unknown table 'x'. (UNKNOWN_TABLE) (version 24.6.6.6 (official build))",
      ),
    ).toBe("Code: 60. Unknown table 'x'. (UNKNOWN_TABLE)");
  });

  it('cuts the echoed query after "in scope"', () => {
    const raw =
      "Code: 47. DB::Exception: Unknown expression identifier 'foo' in scope SELECT foo FROM numbers(10) WHERE foo IN (1, 2, 3, 4)";
    expect(formatClickHouseError(raw)).toBe("Code: 47. Unknown expression identifier 'foo'");
  });

  it('cuts the giant "Expected one of" token list from syntax errors', () => {
    const raw =
      "Code: 62. DB::Exception: Syntax error: failed at position 8 ('FROM'). Expected one of: token, Dot, UUID, alias, AS, identifier, ...";
    expect(formatClickHouseError(raw)).toBe("Code: 62. Syntax error: failed at position 8 ('FROM')");
  });

  it('cuts the echoed data from a "Cannot parse input" error but keeps the row pointer', () => {
    const raw =
      "Code: 27. DB::Exception: Cannot parse input: expected ',' before: 'oops 4,bad-row,more': (at row 3): While executing CSVRowInputFormat. (CANNOT_PARSE_INPUT) (version 24.6.6.6 (official build))";
    expect(formatClickHouseError(raw)).toBe("Code: 27. Cannot parse input: expected ',' (at row 3)");
  });

  it('caps an otherwise-unparseable long message as a fallback', () => {
    const raw = `Code: 99. ${'blah '.repeat(200)}`;
    const result = formatClickHouseError(raw);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith('…')).toBe(true);
  });

  it('collapses whitespace/newlines', () => {
    expect(formatClickHouseError('line one\n   line two\t\tthree')).toBe('line one line two three');
  });

  it('returns a sentinel for empty / non-string input', () => {
    expect(formatClickHouseError('')).toBe('Unknown error');
    expect(formatClickHouseError(undefined)).toBe('Unknown error');
    expect(formatClickHouseError(null)).toBe('Unknown error');
  });
});

describe('truncateForToast', () => {
  it('truncates long messages with an ellipsis', () => {
    const result = truncateForToast('x'.repeat(300), 100);
    expect(result).toHaveLength(100);
    expect(result.endsWith('…')).toBe(true);
  });

  it('leaves short messages unchanged', () => {
    expect(truncateForToast('short message')).toBe('short message');
  });
});

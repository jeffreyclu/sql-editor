import { describe, expect, it } from 'vitest';
import { statementResultToCsv } from './csv';
import type { ColumnMeta, StatementResult } from '../api/types';

function queryResult(columns: ColumnMeta[], rows: Record<string, unknown>[]): StatementResult {
  return { statement: 'SELECT …', kind: 'query', status: 'success', columns, rows };
}

describe('statementResultToCsv', () => {
  it('writes a header row and one CRLF-separated line per row', () => {
    const csv = statementResultToCsv(
      queryResult(
        [
          { name: 'id', type: 'UInt32' },
          { name: 'name', type: 'String' },
        ],
        [
          { id: 1, name: 'alice' },
          { id: 2, name: 'bob' },
        ],
      ),
    );
    expect(csv).toBe('id,name\r\n1,alice\r\n2,bob');
  });

  it('quotes fields with commas, quotes or newlines and escapes embedded quotes (RFC 4180)', () => {
    const csv = statementResultToCsv(
      queryResult(
        [{ name: 'text', type: 'String' }],
        [{ text: 'a,b' }, { text: 'say "hi"' }, { text: 'line1\nline2' }],
      ),
    );
    expect(csv).toBe('text\r\n"a,b"\r\n"say ""hi"""\r\n"line1\nline2"');
  });

  it('renders null/undefined as empty and arrays/objects as JSON', () => {
    const csv = statementResultToCsv(
      queryResult(
        [
          { name: 'a', type: 'Nullable(String)' },
          { name: 'b', type: 'Array(UInt8)' },
        ],
        [{ a: null, b: [1, 2, 3] }],
      ),
    );
    expect(csv).toBe('a,b\r\n,"[1,2,3]"');
  });

  it('returns just the header when there are no rows', () => {
    const csv = statementResultToCsv(queryResult([{ name: 'id', type: 'UInt32' }], []));
    expect(csv).toBe('id');
  });
});

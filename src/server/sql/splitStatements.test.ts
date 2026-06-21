import { describe, expect, it } from 'vitest';
import { splitStatements } from './splitStatements';
import { goldenQueries } from '../../../web/src/data/goldenQueries';

describe('splitStatements', () => {
  it('returns an empty array for blank input', () => {
    expect(splitStatements('')).toEqual([]);
    expect(splitStatements('   \n\t  ')).toEqual([]);
  });

  it('returns a single statement unchanged (no trailing semicolon)', () => {
    expect(splitStatements('SELECT 1')).toEqual(['SELECT 1']);
  });

  it('drops a trailing semicolon and surrounding whitespace', () => {
    expect(splitStatements('  SELECT 1 ;  ')).toEqual(['SELECT 1']);
  });

  it('splits multiple statements in order', () => {
    expect(splitStatements('SELECT 1; SELECT 2; SELECT 3;')).toEqual([
      'SELECT 1',
      'SELECT 2',
      'SELECT 3',
    ]);
  });

  it('ignores empty statements from doubled / trailing semicolons', () => {
    expect(splitStatements('SELECT 1;; ; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  // --- ClickHouse lexical edge cases (DL-003) ---

  it('does not split on a semicolon inside a single-quoted string', () => {
    expect(splitStatements("SELECT 'a;b' AS x; SELECT 2")).toEqual([
      "SELECT 'a;b' AS x",
      'SELECT 2',
    ]);
  });

  it("handles doubled single-quote ('') escaping inside strings", () => {
    expect(splitStatements("SELECT 'it''s fine; really'; SELECT 2")).toEqual([
      "SELECT 'it''s fine; really'",
      'SELECT 2',
    ]);
  });

  it('does not split on a semicolon inside a line comment', () => {
    expect(splitStatements('-- a; b comment\nSELECT 1; SELECT 2')).toEqual([
      '-- a; b comment\nSELECT 1',
      'SELECT 2',
    ]);
  });

  it('does not split on a semicolon inside a block comment', () => {
    expect(splitStatements('SELECT 1; /* block ; comment */ SELECT 2')).toEqual([
      'SELECT 1',
      '/* block ; comment */ SELECT 2',
    ]);
  });

  it('does not split on a semicolon inside a backtick identifier', () => {
    expect(splitStatements('SELECT * FROM `weird;name`; SELECT 2')).toEqual([
      'SELECT * FROM `weird;name`',
      'SELECT 2',
    ]);
  });

  it('splits a self-contained CREATE/INSERT/SELECT script (golden multi-statement)', () => {
    const script = `
      CREATE TABLE demo (id UInt8, label String) ENGINE = Memory;
      INSERT INTO demo VALUES (1, 'one'), (2, 'two');
      SELECT * FROM demo ORDER BY id;
    `;
    expect(splitStatements(script)).toEqual([
      'CREATE TABLE demo (id UInt8, label String) ENGINE = Memory',
      "INSERT INTO demo VALUES (1, 'one'), (2, 'two')",
      'SELECT * FROM demo ORDER BY id',
    ]);
  });
});

describe('splitStatements over the golden dataset (DL-016)', () => {
  it.each(goldenQueries)('splits "$id" into clean, non-empty statements', (golden) => {
    const statements = splitStatements(golden.sql);

    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).toBe(statement.trim());
      expect(statement).not.toBe('');
      expect(statement.endsWith(';')).toBe(false);
    }
    expect(statements).toHaveLength(golden.category === 'multi-statement' ? 3 : 1);
  });
});

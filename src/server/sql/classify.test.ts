import { describe, expect, it } from 'vitest';
import { classifyStatement, leadingKeyword } from './classify';

describe('classifyStatement', () => {
  it.each([
    'SELECT 1',
    'WITH x AS (SELECT 1) SELECT * FROM x',
    'SHOW TABLES',
    'DESCRIBE demo',
    'DESC demo',
    'EXPLAIN SELECT 1',
    'EXISTS TABLE demo',
  ])('classifies data-returning statement as "query": %s', (sql) => {
    expect(classifyStatement(sql)).toBe('query');
  });

  it.each([
    'INSERT INTO demo VALUES (1)',
    'CREATE TABLE demo (id UInt8) ENGINE = Memory',
    'DROP TABLE demo',
    'ALTER TABLE demo ADD COLUMN c UInt8',
    'TRUNCATE TABLE demo',
    'OPTIMIZE TABLE demo',
    'SET max_threads = 4',
  ])('classifies non-data statement as "command": %s', (sql) => {
    expect(classifyStatement(sql)).toBe('command');
  });

  it('is case-insensitive', () => {
    expect(classifyStatement('select 1')).toBe('query');
    expect(classifyStatement('insert into demo values (1)')).toBe('command');
  });

  it('ignores leading whitespace and newlines', () => {
    expect(classifyStatement('\n\t  SELECT 1')).toBe('query');
  });

  it('ignores a leading line comment', () => {
    expect(classifyStatement('-- run me\nSELECT 1')).toBe('query');
  });

  it('ignores a leading block comment', () => {
    expect(classifyStatement('/* note */ INSERT INTO demo VALUES (1)')).toBe('command');
  });

  it('looks past leading parentheses', () => {
    expect(classifyStatement('(SELECT 1) UNION ALL (SELECT 2)')).toBe('query');
  });

  it('defaults empty / keyword-less input to "command"', () => {
    expect(classifyStatement('')).toBe('command');
    expect(classifyStatement('   ')).toBe('command');
  });
});

describe('leadingKeyword', () => {
  it('upper-cases the first keyword', () => {
    expect(leadingKeyword('select 1')).toBe('SELECT');
  });

  it('skips comments, whitespace and parens', () => {
    expect(leadingKeyword('  -- c\n /* b */ ( with x as (select 1) select 1')).toBe('WITH');
  });

  it('returns empty string when there is no keyword', () => {
    expect(leadingKeyword('   ;;;  ')).toBe('');
  });
});

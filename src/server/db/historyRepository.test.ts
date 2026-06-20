import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from './db';
import { createHistoryRepository, type HistoryRepository } from './historyRepository';

describe('historyRepository', () => {
  let repo: HistoryRepository;

  beforeEach(() => {
    repo = createHistoryRepository(createDatabase(':memory:'));
  });

  it('creates an entry with a generated id + timestamp and echoes the fields', () => {
    const entry = repo.create({ sql: 'SELECT 1', status: 'success', statementCount: 1, elapsedMs: 5 });

    expect(entry.id).toHaveLength(36);
    expect(entry.executedAt).toBeTruthy();
    expect(entry).toMatchObject({ sql: 'SELECT 1', status: 'success', statementCount: 1, elapsedMs: 5 });
  });

  it('omits optional fields (elapsedMs, error) when not provided', () => {
    const entry = repo.create({ sql: 'SELECT 1', status: 'success', statementCount: 1 });

    expect(entry.elapsedMs).toBeUndefined();
    expect(entry.error).toBeUndefined();
  });

  it('lists entries most-recent-first', () => {
    repo.create({ sql: 'A', status: 'success', statementCount: 1 });
    repo.create({ sql: 'B', status: 'error', statementCount: 2, error: 'boom' });

    const all = repo.list();
    expect(all.map((e) => e.sql)).toEqual(['B', 'A']);
    expect(all[0]).toMatchObject({ status: 'error', error: 'boom', statementCount: 2 });
  });

  it('caps the result at the requested limit', () => {
    for (let i = 0; i < 5; i += 1) {
      repo.create({ sql: `q${i}`, status: 'success', statementCount: 1 });
    }
    expect(repo.list(2)).toHaveLength(2);
  });

  it('gets an entry by id (undefined when missing)', () => {
    const created = repo.create({ sql: 'SELECT 1', status: 'success', statementCount: 1 });

    expect(repo.get(created.id)).toEqual(created);
    expect(repo.get('does-not-exist')).toBeUndefined();
  });

  it('deletes by id and reports whether a row was removed', () => {
    const created = repo.create({ sql: 'SELECT 1', status: 'success', statementCount: 1 });

    expect(repo.delete(created.id)).toBe(true);
    expect(repo.delete(created.id)).toBe(false);
    expect(repo.get(created.id)).toBeUndefined();
  });

  it('clears all entries', () => {
    repo.create({ sql: 'A', status: 'success', statementCount: 1 });
    repo.create({ sql: 'B', status: 'success', statementCount: 1 });

    repo.clear();
    expect(repo.list()).toEqual([]);
  });
});

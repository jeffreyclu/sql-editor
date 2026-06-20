import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from './db';
import { createSavedQueryRepository, type SavedQueryRepository } from './savedQueryRepository';

describe('savedQueryRepository', () => {
  let repo: SavedQueryRepository;

  beforeEach(() => {
    repo = createSavedQueryRepository(createDatabase(':memory:'));
  });

  it('creates a saved query with an id and equal created/updated timestamps', () => {
    const query = repo.create({ name: 'top tables', sql: 'SHOW TABLES' });

    expect(query.id).toHaveLength(36);
    expect(query).toMatchObject({ name: 'top tables', sql: 'SHOW TABLES' });
    expect(query.createdAt).toBe(query.updatedAt);
  });

  it('lists saved queries most-recently-updated first', () => {
    const a = repo.create({ name: 'a', sql: 'SELECT 1' });
    const b = repo.create({ name: 'b', sql: 'SELECT 2' });

    expect(repo.list().map((q) => q.id)).toEqual([b.id, a.id]);
  });

  it('gets by id (undefined when missing)', () => {
    const query = repo.create({ name: 'a', sql: 'SELECT 1' });

    expect(repo.get(query.id)).toEqual(query);
    expect(repo.get('nope')).toBeUndefined();
  });

  it('updates a field, preserves createdAt, and does not move updatedAt backwards', () => {
    const query = repo.create({ name: 'a', sql: 'SELECT 1' });

    const updated = repo.update(query.id, { name: 'renamed' });
    expect(updated).toMatchObject({ id: query.id, name: 'renamed', sql: 'SELECT 1', createdAt: query.createdAt });
    expect(updated!.updatedAt >= query.updatedAt).toBe(true);
  });

  it('applies a partial update, leaving other fields intact', () => {
    const query = repo.create({ name: 'a', sql: 'SELECT 1' });

    const updated = repo.update(query.id, { sql: 'SELECT 2' });
    expect(updated).toMatchObject({ name: 'a', sql: 'SELECT 2' });
  });

  it('returns undefined when updating a missing query', () => {
    expect(repo.update('nope', { name: 'x' })).toBeUndefined();
  });

  it('deletes and reports removal', () => {
    const query = repo.create({ name: 'a', sql: 'SELECT 1' });

    expect(repo.delete(query.id)).toBe(true);
    expect(repo.delete(query.id)).toBe(false);
    expect(repo.get(query.id)).toBeUndefined();
  });
});

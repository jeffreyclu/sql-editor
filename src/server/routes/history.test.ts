import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDatabase } from '../db/db';
import { createHistoryRepository, type HistoryRepository } from '../db/historyRepository';
import { createHistoryRouter } from './history';

function appWith(repo: HistoryRepository) {
  const app = express();
  app.use(express.json());
  app.use('/api/history', createHistoryRouter({ historyRepository: repo }));
  return app;
}

describe('/api/history routes', () => {
  let repo: HistoryRepository;

  beforeEach(() => {
    repo = createHistoryRepository(createDatabase(':memory:'));
  });

  it('GET / lists history most-recent-first', async () => {
    repo.create({ sql: 'A', status: 'success', statementCount: 1 });
    repo.create({ sql: 'B', status: 'error', statementCount: 1, error: 'boom' });

    const res = await request(appWith(repo)).get('/api/history');

    expect(res.status).toBe(200);
    expect(res.body.map((e: { sql: string }) => e.sql)).toEqual(['B', 'A']);
  });

  it('GET /?limit=N caps the number of entries', async () => {
    for (let i = 0; i < 3; i += 1) {
      repo.create({ sql: `q${i}`, status: 'success', statementCount: 1 });
    }

    const res = await request(appWith(repo)).get('/api/history?limit=1');

    expect(res.body).toHaveLength(1);
  });

  it('DELETE /:id removes one entry', async () => {
    const entry = repo.create({ sql: 'A', status: 'success', statementCount: 1 });

    const res = await request(appWith(repo)).delete(`/api/history/${entry.id}`);

    expect(res.status).toBe(204);
    expect(repo.get(entry.id)).toBeUndefined();
  });

  it('DELETE /:id returns 404 for a missing entry', async () => {
    const res = await request(appWith(repo)).delete('/api/history/missing');
    expect(res.status).toBe(404);
  });

  it('DELETE / clears all history', async () => {
    repo.create({ sql: 'A', status: 'success', statementCount: 1 });
    repo.create({ sql: 'B', status: 'success', statementCount: 1 });

    const res = await request(appWith(repo)).delete('/api/history');

    expect(res.status).toBe(204);
    expect(repo.list()).toEqual([]);
  });
});

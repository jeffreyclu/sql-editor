import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDatabase } from '../db/db';
import { createSavedQueryRepository, type SavedQueryRepository } from '../db/savedQueryRepository';
import { createSavedQueriesRouter } from './queries';

function appWith(repo: SavedQueryRepository) {
  const app = express();
  app.use(express.json());
  app.use('/api/queries', createSavedQueriesRouter({ savedQueryRepository: repo }));
  return app;
}

describe('/api/queries routes', () => {
  let repo: SavedQueryRepository;

  beforeEach(() => {
    repo = createSavedQueryRepository(createDatabase(':memory:'));
  });

  it('POST / creates a saved query and returns 201 with the entity', async () => {
    const res = await request(appWith(repo))
      .post('/api/queries')
      .send({ name: 'top tables', sql: 'SHOW TABLES' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'top tables', sql: 'SHOW TABLES' });
    expect(res.body.id).toHaveLength(36);
    expect(repo.get(res.body.id)).toBeTruthy();
  });

  it('POST / returns 400 when name or sql is missing', async () => {
    const app = appWith(repo);

    for (const body of [{}, { name: 'x' }, { sql: 'SELECT 1' }, { name: '  ', sql: 'SELECT 1' }]) {
      const res = await request(app).post('/api/queries').send(body);
      expect(res.status).toBe(400);
    }
  });

  it('GET / lists saved queries', async () => {
    repo.create({ name: 'a', sql: 'SELECT 1' });
    repo.create({ name: 'b', sql: 'SELECT 2' });

    const res = await request(appWith(repo)).get('/api/queries');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET /:id returns the entity or 404', async () => {
    const created = repo.create({ name: 'a', sql: 'SELECT 1' });
    const app = appWith(repo);

    const found = await request(app).get(`/api/queries/${created.id}`);
    expect(found.status).toBe(200);
    expect(found.body.id).toBe(created.id);

    const missing = await request(app).get('/api/queries/nope');
    expect(missing.status).toBe(404);
  });

  it('PUT /:id updates an existing query', async () => {
    const created = repo.create({ name: 'a', sql: 'SELECT 1' });

    const res = await request(appWith(repo))
      .put(`/api/queries/${created.id}`)
      .send({ name: 'renamed' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: created.id, name: 'renamed', sql: 'SELECT 1' });
  });

  it('PUT /:id returns 400 with no updatable fields and 404 when missing', async () => {
    const created = repo.create({ name: 'a', sql: 'SELECT 1' });
    const app = appWith(repo);

    const empty = await request(app).put(`/api/queries/${created.id}`).send({});
    expect(empty.status).toBe(400);

    const missing = await request(app).put('/api/queries/nope').send({ name: 'x' });
    expect(missing.status).toBe(404);
  });

  it('DELETE /:id removes a query (404 when missing)', async () => {
    const created = repo.create({ name: 'a', sql: 'SELECT 1' });
    const app = appWith(repo);

    const ok = await request(app).delete(`/api/queries/${created.id}`);
    expect(ok.status).toBe(204);
    expect(repo.get(created.id)).toBeUndefined();

    const missing = await request(app).delete(`/api/queries/${created.id}`);
    expect(missing.status).toBe(404);
  });
});

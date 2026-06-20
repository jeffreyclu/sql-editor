import { Router } from 'express';
import type { SavedQueryRepository } from '../db/savedQueryRepository';

export interface SavedQueriesRouteDeps {
  savedQueryRepository: SavedQueryRepository;
}

/**
 * `/api/queries` — CRUD for explicit, named saved queries (DL-013):
 *   - `GET    /`     list (most-recently-updated first)
 *   - `POST   /`     create `{ name, sql }` → 201 with the new query
 *   - `GET    /:id`  fetch one (404 if missing)
 *   - `PUT    /:id`  update `{ name?, sql? }` (404 if missing)
 *   - `DELETE /:id`  remove one (204; 404 if missing)
 */
export function createSavedQueriesRouter({ savedQueryRepository }: SavedQueriesRouteDeps): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(savedQueryRepository.list());
  });

  router.post('/', (req, res) => {
    const { name, sql } = (req.body ?? {}) as { name?: unknown; sql?: unknown };
    if (!isNonEmptyString(name) || !isNonEmptyString(sql)) {
      res.status(400).json({ error: "'name' and 'sql' are required" });
      return;
    }
    res.status(201).json(savedQueryRepository.create({ name: name.trim(), sql }));
  });

  router.get('/:id', (req, res) => {
    const query = savedQueryRepository.get(req.params.id);
    if (!query) {
      res.status(404).json({ error: 'Saved query not found' });
      return;
    }
    res.json(query);
  });

  router.put('/:id', (req, res) => {
    const { name, sql } = (req.body ?? {}) as { name?: unknown; sql?: unknown };

    if (name !== undefined && !isNonEmptyString(name)) {
      res.status(400).json({ error: "'name' must be a non-empty string" });
      return;
    }
    if (sql !== undefined && typeof sql !== 'string') {
      res.status(400).json({ error: "'sql' must be a string" });
      return;
    }
    if (name === undefined && sql === undefined) {
      res.status(400).json({ error: "provide 'name' and/or 'sql' to update" });
      return;
    }

    const updated = savedQueryRepository.update(req.params.id, {
      name: isNonEmptyString(name) ? name.trim() : undefined,
      sql: typeof sql === 'string' ? sql : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Saved query not found' });
      return;
    }
    res.json(updated);
  });

  router.delete('/:id', (req, res) => {
    if (!savedQueryRepository.delete(req.params.id)) {
      res.status(404).json({ error: 'Saved query not found' });
      return;
    }
    res.status(204).end();
  });

  return router;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

import { Router } from 'express';
import type { HistoryRepository } from '../db/historyRepository';

export interface HistoryRouteDeps {
  historyRepository: HistoryRepository;
}

/**
 * `/api/history` — read and prune the auto-logged run history (DL-013):
 *   - `GET    /`     list recent runs (most recent first; optional `?limit`)
 *   - `DELETE /:id`  remove one entry
 *   - `DELETE /`     clear all history
 *
 * Read-only consumers get an array; mutations reply 204. History is never created
 * here — it is auto-logged by `POST /query`.
 */
export function createHistoryRouter({ historyRepository }: HistoryRouteDeps): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(historyRepository.list(parseLimit(req.query.limit)));
  });

  router.delete('/:id', (req, res) => {
    if (!historyRepository.delete(req.params.id)) {
      res.status(404).json({ error: 'History entry not found' });
      return;
    }
    res.status(204).end();
  });

  router.delete('/', (_req, res) => {
    historyRepository.clear();
    res.status(204).end();
  });

  return router;
}

/** Parse a positive integer `?limit`; ignore anything invalid (repository default applies). */
function parseLimit(raw: unknown): number | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const limit = Number.parseInt(raw, 10);
  return Number.isInteger(limit) && limit > 0 ? limit : undefined;
}

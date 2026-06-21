import { Router } from 'express';
import type { SqlGenerator, SchemaInput } from '../ai/sqlGenerator';

export interface AiRouteDeps {
  /**
   * The NL→SQL generator (injected for testability — DIP). Defaults in `app.ts` to the real
   * Gemini-backed generator; tests inject a fake (no API key needed — DL-031/DL-032).
   */
  sqlGenerator: SqlGenerator;
  /**
   * Whether the provider is configured (i.e. `GEMINI_API_KEY` is set). Read once at app
   * construction so the route can answer 503 *before* touching the generator (DL-031/DL-032).
   * Defaults to a live `process.env.GEMINI_API_KEY` check.
   */
  isConfigured?: () => boolean;
}

/**
 * `/api/ai` — the NL→SQL assistant (DL-031/DL-032). Server-side proxy so the provider key
 * never reaches the browser; generated SQL is returned for the user to review and run (never
 * auto-executed — that policy lives in the frontend plugin).
 *
 *   - `POST /sql` `{ prompt, schema? }` →
 *       - 400 when `prompt` is missing/empty,
 *       - 503 `{ error: 'AI assistant not configured' }` when `GEMINI_API_KEY` is unset,
 *       - 200 `{ sql, explanation? }` on success,
 *       - 429 `{ error }` (friendly retry) on a detectable provider rate-limit,
 *       - 500 `{ error }` on any other provider/transport fault.
 */
export function createAiRouter({
  sqlGenerator,
  isConfigured = () => Boolean(process.env.GEMINI_API_KEY),
}: AiRouteDeps): Router {
  const router = Router();

  router.post('/sql', async (req, res) => {
    const { prompt, schema } = (req.body ?? {}) as { prompt?: unknown; schema?: unknown };

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      res.status(400).json({ error: "'prompt' is required" });
      return;
    }

    // Check configuration before calling the generator, so an unset key is a clean 503 rather
    // than a 500 from the SDK rejecting an empty key (DL-031/DL-032).
    if (!isConfigured()) {
      res.status(503).json({ error: 'AI assistant not configured' });
      return;
    }

    try {
      const result = await sqlGenerator.generate({
        prompt,
        schema: schema as SchemaInput | undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      if (isRateLimitError(error)) {
        res.status(429).json({ error: 'The AI assistant is busy right now — try again in a moment.' });
        return;
      }
      res.status(500).json({ error: toErrorMessage(error) });
    }
  });

  return router;
}

/**
 * Best-effort detection of a provider rate-limit so the free-tier 429 surfaces as a friendly
 * retry message (DL-032). The `@google/genai` SDK throws an `ApiError` carrying the upstream
 * HTTP status; we also fall back to message sniffing for resilience across SDK versions.
 */
function isRateLimitError(error: unknown): boolean {
  const status = (error as { status?: unknown; code?: unknown })?.status ?? (error as { code?: unknown })?.code;
  if (status === 429) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /\b429\b|rate.?limit|resource_exhausted|too many requests/i.test(message);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}

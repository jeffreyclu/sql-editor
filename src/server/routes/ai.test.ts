import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createAiRouter } from './ai';
import type { GeneratedSql, GenerateSqlInput, SqlGenerator } from '../ai/sqlGenerator';

/** Build a fake generator from a `generate` impl (no API key needed — DL-031/DL-032). */
function fakeGenerator(generate: SqlGenerator['generate']): SqlGenerator {
  return { generate };
}

/**
 * Mount the AI router on a bare app with the JSON body parser. `configured` toggles the
 * route's `isConfigured` gate so the 503 path can be exercised without touching `process.env`.
 */
function makeApp(sqlGenerator: SqlGenerator, configured = true): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', createAiRouter({ sqlGenerator, isConfigured: () => configured }));
  return app;
}

describe('POST /api/ai/sql', () => {
  it('returns 200 { sql, explanation? } from the generator', async () => {
    const result: GeneratedSql = { sql: 'SELECT 1', explanation: 'Returns the constant 1.' };
    const generate = vi.fn(async (_input: GenerateSqlInput) => result);
    const app = makeApp(fakeGenerator(generate));

    const schema = [{ name: 'default', tables: [{ name: 't', columns: [{ name: 'id', type: 'UInt8' }] }] }];
    const res = await request(app).post('/api/ai/sql').send({ prompt: 'get one', schema });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    // Prompt + schema are forwarded to the generator unchanged (FE↔BE wire contract).
    expect(generate).toHaveBeenCalledWith({ prompt: 'get one', schema });
  });

  it('returns 200 with only sql when the generator omits the explanation', async () => {
    const generate = vi.fn(async () => ({ sql: 'SELECT 2' }) satisfies GeneratedSql);
    const app = makeApp(fakeGenerator(generate));

    const res = await request(app).post('/api/ai/sql').send({ prompt: 'two' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sql: 'SELECT 2' });
  });

  it('returns 400 when the prompt is missing or empty', async () => {
    const generate = vi.fn(async () => ({ sql: 'unused' }));
    const app = makeApp(fakeGenerator(generate));

    for (const body of [{}, { prompt: '' }, { prompt: '   ' }, { prompt: 42 }]) {
      const res = await request(app).post('/api/ai/sql').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("'prompt' is required");
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns 503 when GEMINI_API_KEY is unset (provider not configured)', async () => {
    const generate = vi.fn(async () => ({ sql: 'unused' }));
    const app = makeApp(fakeGenerator(generate), /* configured */ false);

    const res = await request(app).post('/api/ai/sql').send({ prompt: 'anything' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI assistant not configured');
    // The generator is never touched when unconfigured.
    expect(generate).not.toHaveBeenCalled();
  });

  it('maps an unexpected generator error to 500 { error }', async () => {
    const app = makeApp(
      fakeGenerator(async () => {
        throw new Error('upstream exploded');
      }),
    );

    const res = await request(app).post('/api/ai/sql').send({ prompt: 'boom' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('upstream exploded');
  });

  it('maps a provider rate-limit (429) to a friendly retry message', async () => {
    const app = makeApp(
      fakeGenerator(async () => {
        throw Object.assign(new Error('Resource exhausted'), { status: 429 });
      }),
    );

    const res = await request(app).post('/api/ai/sql').send({ prompt: 'rate me' });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/try again/i);
  });
});

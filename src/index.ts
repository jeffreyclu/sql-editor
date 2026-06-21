import fs from 'fs';
import { createApp } from './server/app';
import { createDatabase } from './server/db/db';
import { createHistoryRepository } from './server/db/historyRepository';
import { createSavedQueryRepository } from './server/db/savedQueryRepository';

// Load env files into process.env before anything reads them (e.g. GEMINI_API_KEY — DL-032).
// Zero-dependency: Node's built-in `process.loadEnvFile` (Node >= 20.6). `.env.local` overrides
// `.env`; both are gitignored. Best-effort — a missing file is fine (the app runs without keys).
for (const file of ['.env', '.env.local']) {
  if (fs.existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const port = Number(process.env.PORT ?? 8080);

// File-backed persistence for history + saved queries (DL-013). Gitignored; path overridable.
const db = createDatabase(process.env.DB_FILE ?? 'data/app.db');
const app = createApp({
  historyRepository: createHistoryRepository(db),
  savedQueryRepository: createSavedQueryRepository(db),
});

app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});

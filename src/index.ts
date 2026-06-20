import { createApp } from './server/app';
import { createDatabase } from './server/db/db';
import { createHistoryRepository } from './server/db/historyRepository';
import { createSavedQueryRepository } from './server/db/savedQueryRepository';

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

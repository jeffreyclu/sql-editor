# Backend Build Log

A chronological, append-only record of backend work on the ClickHouse SQL Web Editor.
One entry per reviewable slice. Newest entries at the bottom. References to `DL-xxx`
point at `DECISION_LOG.md`; the overall plan is `IMPLEMENTATION_PLAN.md`.

> Scope note: this log covers the backend track only (`src/server/**`, `src/index.ts`,
> and backend-owned tooling: backend deps, `vitest.config.ts`). Frontend work under
> `web/` is tracked separately by the frontend track.

---

## Slice 1 — SQL execution pipeline + `POST /query`

- **Date:** 2026-06-19
- **Status:** Complete, awaiting review. Tests green (41 passed).
- **Plan phase:** 2 (Backend query). Persistence (phase 3) deferred to Slice 2.

### What was built

The core query path: take a single- or multi-statement SQL script, split it, classify
each statement, execute in order against ClickHouse, and return per-statement results.

| File | Responsibility |
|---|---|
| `src/server/types.ts` | Shared contract: `ColumnMeta`, `StatementKind`, `StatementStatus`, `StatementResult`, `RunResponse` (DL-004). |
| `src/server/sql/splitStatements.ts` | Splits multi-statement scripts via `dbgate-query-splitter` using the **MySQL preset** — closest match to ClickHouse lexical rules (DL-003). |
| `src/server/sql/classify.ts` | `classifyStatement` + `leadingKeyword`: routes `SELECT/WITH/SHOW/DESCRIBE/DESC/EXPLAIN/EXISTS` → `query`, everything else → `command`; strips leading whitespace, line/block comments, and parens (DL-004). |
| `src/server/clickhouse.ts` | `extractClickHouseHeaders` (`x-clickhouse-*` forwarding, lifted from old `index.ts`) + a narrow `ClickHouseExecutor` port and the production `createClickHouseExecutor` factory (ISP/DIP, DL-005). |
| `src/server/routes/query.ts` | `createQueryRouter` — `POST /query`: validate → split → classify → execute sequentially, **stop on first error** → `200 { statements }`. Server-side row cap (`DEFAULT_ROW_LIMIT = 1000`) + `truncated` flag (DL-009). |
| `src/server/app.ts` | `createApp(deps?)` Express factory with injectable `createExecutor`/`rowLimit`; mounts `/query` and `GET /api/health`. Constructable in tests with no socket/network. |
| `src/index.ts` | Entry point; rewritten to use `createApp()` (replaces the old inline `/query` handler and the `GET /` "Hello world!"). |
| `vitest.config.ts` | Node-environment test config scoped to `src/**/*.test.ts`. |
| `src/server/sql/splitStatements.test.ts` | Splitter edge cases: `;` in strings, `''` escaping, `--` and block comments, backtick identifiers, multi-statement script. |
| `src/server/sql/classify.test.ts` | Classifier over query/command keywords, case-insensitivity, leading comments/parens, empty input. |
| `src/server/routes/query.test.ts` | `/query` via supertest with a mocked executor: 400 validation, single SELECT mapping, command, multi-statement ordering, stop-on-first-error, row-cap/truncation, 500 transport fault. |

### Behavior contract (`POST /query`)

- Request: `{ "query": string }`. `400 { error }` if missing/empty/non-string.
- Response: `200 { statements: StatementResult[] }` — one entry per executed statement, in order.
- Per-statement **errors are data** (status `'error'` + `error.message`); execution stops at
  the first error, so remaining statements are absent from the array.
- `query` statements include `columns`, `rows` (capped), `rowCount`, `truncated`, `elapsedMs`
  (from `statistics.elapsed * 1000`), `queryId`. `command` statements include only `queryId`.
- `500 { error }` reserved for transport/server faults (e.g. client construction failure).

### Key decisions / trade-offs

- **Narrow `ClickHouseExecutor` port** keeps `@clickhouse/client` isolated to `clickhouse.ts`
  and lets the route be tested with a plain mock (no full-client stubbing/casting).
- **MySQL splitter preset** chosen and **validated against ClickHouse edge cases** in unit
  tests (DL-003); no custom options needed so far.
- **Row cap is post-fetch slicing** (DL-009). Simple and correct for this scope; a future
  hardening for very large results would push the cap to ClickHouse (`max_result_rows`).
- **Golden dataset not yet wired into tests** — `web/src/data/goldenQueries.ts` is frontend
  territory; backend tests use inline fixtures for now and can repoint later (DL-016).

### Tooling changes (backend-owned)

- Added deps: `dbgate-query-splitter`. Dev: `vitest`, `supertest`, `@types/supertest`.
- Bumped `typescript` → 5.x and `@types/node` → 20 (resolved by npm during install).
- `package.json` scripts: `test` → `vitest run`, added `test:watch` → `vitest`.

### Verification

- `npm test` → **41 passed** across 3 files (188ms).
- Backend **source** is type-clean.

### Open items / coordination

- `tsconfig.json` still has `moduleResolution: "node"`, which makes `tsc --noEmit` fail inside
  **vitest 4's own type defs** (not our code). Needs `moduleResolution: "bundler"`/`"node16"`
  (+ `skipLibCheck`) as part of the frontend tsconfig split — left untouched to avoid clobbering
  the parallel frontend agent. Tests are unaffected (vitest uses esbuild).
- Production SPA static serving / `GET /` is intentionally not added yet (no frontend build to
  serve); to be wired when `dist/public` exists.

### Next slice

**Slice 2 — Persistence (DL-013):** `db/db.ts` (better-sqlite3 + migration on boot),
`historyRepository` + `savedQueryRepository` (interfaces + SQLite impls), `/api/history` and
`/api/queries` routes, and auto-logging history from `POST /query`. Tests: repositories
(in-memory SQLite) + extended `/query` route test asserting history is recorded.

---

## Slice 1b — Dev/prod serving (interlude)

- **Date:** 2026-06-19
- **Status:** Complete, verified. Done after the frontend finished its slice 1.

Wired the two halves together now that a buildable SPA exists:

- **Production SPA serving** — `app.ts` `mountSpa()` serves `dist/public` at `/` with a
  history-API fallback, **only when a build exists** (guarded by `fs.existsSync`), so dev and
  tests stay API-only and never shadow `/api` or `/query`.
- **Combined dev script** — `npm run dev` = `concurrently` running `tsx watch src/index.ts`
  (backend, :8080) + `npm:dev:web` (Vite). Added `concurrently` devDep.

Verified by building (`npm run build`) and curling a running server: `GET /` → built SPA,
`GET /history` → SPA fallback, `GET /api/health` → ok, `POST /query` → new `{ statements }`.

> Gotcha found: a stale pre-rewrite server can hold `:8080` (`EADDRINUSE`) and answer with the
> old `Hello world!` / `{ rows }`. Kill the listener on `:8080` before `npm start`.

---

## Slice 2 — Persistence: history + saved queries

- **Date:** 2026-06-19
- **Status:** Complete, awaiting review. Tests green (**69 passed**, up from 41); verified E2E
  against live ClickHouse.
- **Plan phase:** 3 (Persistence).

### What was built

SQLite-backed persistence (DL-013) behind repository interfaces (DIP), two new API route
groups, and auto-logging of every run into history.

| File | Responsibility |
|---|---|
| `src/server/db/db.ts` | `createDatabase(filename=':memory:')` — opens SQLite, creates parent dir + WAL for file DBs, runs idempotent schema migration (`query_history`, `saved_query`). Exports `AppDatabase`. |
| `src/server/db/historyRepository.ts` | `HistoryRepository` interface + SQLite impl: `list(limit=100)` (most-recent-first), `get`, `create`, `delete`, `clear`. snake_case rows ↔ camelCase domain. |
| `src/server/db/savedQueryRepository.ts` | `SavedQueryRepository` interface + SQLite impl: `list` (recently-updated first), `get`, `create`, `update` (partial, bumps `updatedAt`), `delete`. |
| `src/server/routes/history.ts` | `/api/history`: `GET /` (`?limit`), `DELETE /:id` (404 if missing), `DELETE /` (clear). |
| `src/server/routes/queries.ts` | `/api/queries`: `GET /`, `POST /` (201), `GET/PUT/DELETE /:id`, with 400/404 validation. |
| `src/server/routes/query.ts` | Extended: optional `historyRepository`; **best-effort `recordHistory`** on every run (success, per-statement error, and transport 500) — logging failures never break the response. |
| `src/server/app.ts` | `AppDeps` gains `historyRepository`/`savedQueryRepository`; `resolveRepositories` injects them or provisions a throwaway in-memory DB (so `createApp()` is filesystem-free in tests). Mounts the two route groups. |
| `src/index.ts` | Composes a file-backed DB (`DB_FILE` or `data/app.db`) + repos and injects them into `createApp`. |
| `src/server/types.ts` | Added `HistoryEntry`/`NewHistoryEntry`, `SavedQuery`/`NewSavedQuery`/`SavedQueryUpdate`. |
| Tests (×4 new, ×1 extended) | Repository CRUD (in-memory SQLite), `/api/history` + `/api/queries` route behavior (supertest), and `/query` history auto-logging (success + error). |

### API contract (new)

- `GET /api/history` → `HistoryEntry[]` (most-recent-first; `?limit=N`).
- `DELETE /api/history/:id` → 204 (404 if missing); `DELETE /api/history` → 204 (clear).
- `GET /api/queries` → `SavedQuery[]`; `POST /api/queries {name,sql}` → 201 `SavedQuery`.
- `GET/PUT/DELETE /api/queries/:id` → entity / 204; 404 when missing, 400 on invalid body.
- List endpoints return bare arrays; single-resource endpoints return the entity.

### Key decisions / trade-offs

- **`:memory:` default for `createDatabase`** keeps `createApp()` side-effect-free in tests;
  production injects a file-backed DB from `index.ts`. No DB file is ever written implicitly.
- **Repositories return domain objects** (camelCase), mapping from snake_case rows — the SQLite
  schema stays an implementation detail behind the interface.
- **History logging is best-effort** — a persistence failure logs to stderr but never affects
  the query response (availability over bookkeeping).
- **IDs** via `crypto.randomUUID()`; **timestamps** as ISO-8601 strings (sort lexicographically).
- DB artifacts gitignored (`data/`, `*.db*`, `*.sqlite`).

### Tooling changes (backend-owned)

- Added deps: `better-sqlite3`. Dev: `@types/better-sqlite3`. (Native module verified to load.)

### Verification

- `npm test` → **69 passed** across 7 files.
- E2E against live ClickHouse (temp DB, throwaway port): multi-statement run + a deliberately
  failing query both auto-logged to `/api/history` (error captured ClickHouse's message);
  saved-query create/list/update/delete round-tripped correctly.

### Open items / coordination

- The `tsconfig.json` `moduleResolution` item from Slice 1 still stands (frontend tsconfig split).
- Frontend will consume `/api/history` + `/api/queries`; the contract above is the reference.

### Next slice

No further backend slices are required by the plan for the base product. Remaining backend work
is **deferred**: the file-import plugin endpoint (`POST /import` via multer, DL-006) when that
feature is picked up.

---

## Review R1 — fixes applied

- **Date:** 2026-06-20
- **Status:** Complete. All R1 findings (see `BACKEND_REVIEW_LOG.md`) resolved. Tests **70 passed**;
  both fixes verified E2E against live ClickHouse.

| Finding | Fix |
|---|---|
| **HIGH-1** results buffered before cap (OOM risk) | Added `QueryOptions { maxRows }` to the `ClickHouseExecutor` port; `createClickHouseExecutor` now sets `clickhouse_settings: { max_result_rows: String(maxRows), result_overflow_mode: 'break' }`. The route passes `maxRows: rowLimit + 1`, so ClickHouse stops early (memory-bounded) while the extra row still lets us detect + flag `truncated`. The post-fetch slice stays as belt-and-suspenders. Verified: `SELECT … FROM numbers(100000)` → `rowCount=1000, truncated=true` (no 100k buffer). |
| **HIGH-2** body-parser errors return HTML, breaking the JSON contract | Added a terminal `jsonErrorHandler` (Express error middleware) in `createApp`; honours the error's own status (400 malformed JSON, 413 oversized) and always responds `{ error }`. Verified: malformed body → `400 {"error":…}`, oversized → `413 {"error":"request entity too large"}` (both JSON). New test covers the malformed-body path. |
| **NOTE** `rowCount`/`totalRows` | Resolved-by-design with HIGH-1: with the CH-side `break` cap, the true total is no longer available (CH stops early), so `truncated` remains the signal and no `totalRows` field is added — keeps the FE↔BE contract unchanged. |
| **NOTE** DL-007 tslint/body-parser | Removed `tslint` + `tslint.json` and the now-unused `body-parser` dependency. |
| **NOTE** tsconfig `moduleResolution` | Still deferred (shared frontend tsconfig split) — unchanged, as the review agreed. |

No change to `StatementResult`, so the FE mirror (`web/src/api/types.ts`) needs no update.

---

## Committed to `main`

- **Date:** 2026-06-20
- **Status:** All backend work (Slices 1, 1b, 2 + Review R1 fixes) committed to `main` in five
  dependency-ordered chunks — each commit's tree builds only on what precedes it, so any prefix
  is self-consistent. Committed directly to `main` at the user's explicit request; not pushed.

| Commit | Scope |
|---|---|
| `6765994` `chore(backend)` | Test toolchain + deps (vitest, supertest, dbgate-query-splitter, better-sqlite3, concurrently); TS 5 / @types/node 20 bump; dropped tslint + body-parser; vitest config; gitignore for SQLite files. |
| `cda96b9` `feat(backend)` | SQL core: domain `types.ts`, `sql/splitStatements`, `sql/classify`, `clickhouse.ts` executor port (+ unit tests). |
| `bcf2f8f` `feat(backend)` | SQLite persistence: `db/db.ts` + history/saved-query repositories (+ in-memory CRUD tests). |
| `da2a32e` `feat(backend)` | HTTP API: `/query`, `/api/history`, `/api/queries`, `app.ts` factory, `index.ts`, JSON error handler (+ supertest tests). |
| `efdb506` `docs(backend)` | This build log + the review log. |

### Notes
- `package.json` / `package-lock.json` are a single file shared with the frontend track, so the
  tooling commit unavoidably also carries the frontend's dependency entries.
- Left uncommitted (not backend-owned): `web/`, `vite.config.ts`, `tsconfig.node.json`, the
  `FRONTEND_*` logs, and the shared planning docs (`CLAUDE.md`, `DECISION_LOG.md`, `SKILL.md`,
  `IMPLEMENTATION_PLAN.md`) being edited by other agents.

---

## Slice 3 — File import endpoint (`POST /import`)

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests **77 passed**; verified E2E against live ClickHouse.
- **Plan phase:** 8 (previously "later"; the deferred bonus per DL-006).

### What was built

The backend half of the future `fileImportPlugin`: stream an uploaded file's rows into an
existing ClickHouse table.

| File | Responsibility |
|---|---|
| `src/server/routes/import.ts` | `POST /import` (multipart): fields `file`, `table`, optional `format` (default `CSVWithNames`, whitelisted). Validates input, streams the upload into ClickHouse, returns `{ table, format, rowsWritten?, queryId }`. Multer runs inline so its errors return JSON. |
| `src/server/clickhouse.ts` | Extended the `ClickHouseExecutor` port with `insert({ table, values, format })` → `{ query_id, rowsWritten? }` (reads `summary.written_rows`). |
| `src/server/app.ts` | Mounts `/import` (reuses the injected `createExecutor`). |
| `src/server/routes/import.test.ts` | Supertest coverage: CSV streamed to the right table, explicit format, 400s (missing file/table, unsupported format, insert rejection), 413 (oversized). |

### Key decisions / trade-offs

- **multer** for `multipart/form-data` parsing (DL-006 named it). Express has no native
  multipart parser; multer is the de-facto Express middleware for file uploads.
- **memoryStorage + size cap** (`DEFAULT_MAX_UPLOAD_BYTES = 50 MB`): simple and memory-bounded by
  the cap. True disk/stream-through for very large files is future hardening.
- **Insert into an existing table only** — schema inference / table creation is out of scope.
- **Table name validated** as an optionally db-qualified identifier (review R3) — a bad name gets a
  clear 400 before reaching ClickHouse. Not a security control (`/query` already runs arbitrary SQL).
- **Format whitelist** (`CSV`/`CSVWithNames`/`TabSeparated`/`TabSeparatedWithNames`/`JSONEachRow`)
  so an arbitrary string can't reach ClickHouse.
- **Insert rejections → 400** with the ClickHouse message (the common case is user-correctable:
  unknown table, type mismatch, malformed rows).

### Gotcha found + fixed (by E2E, not the unit test)

`Readable.from(buffer)` yields an **object-mode** stream, which the ClickHouse client rejects for
raw formats ("expected Readable Stream with disabled object mode"). Fixed to
`Readable.from([buffer], { objectMode: false })`, and added a regression assertion
(`readableObjectMode === false`) since only the real client enforces this — the mock didn't.

### Contract for the frontend

`fileImportPlugin` should `POST /import` as `multipart/form-data` with `file` + `table`
(+ optional `format`); success → `{ table, format, rowsWritten?, queryId }`, errors → `{ error }`.

---

## Follow-up — golden dataset wired into backend tests (DL-016)

- **Date:** 2026-06-20
- **Status:** Complete. Resolves the DL-016 deviation noted in Slice 1 and the frontend review
  (R4 NOTE: "backend tests still use inline fixtures"). Tests **94 passed**.

`web/src/data/goldenQueries.ts` (pure, framework-agnostic data) is now imported by the backend
tests, making it the single source of truth for both the UI Examples picker and the backend
fixtures as DL-016 intends:
- `splitStatements.test.ts` — splits every golden query into clean, non-empty statements
  (multi-statement → 3, others → 1).
- `classify.test.ts` — classifies each golden statement (multi-statement → CREATE/INSERT/SELECT =
  command/command/query; others → query).
- `query.test.ts` — runs each golden example through `POST /query` (mocked executor) and asserts
  one result per statement.

The adversarial lexical edge-case tests (`;`/`''`/comments/backticks) are kept inline — they
aren't representable as UI examples, so they stay alongside the golden-driven cases.

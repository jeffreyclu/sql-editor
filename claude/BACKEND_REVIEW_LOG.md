# Backend Review Log

Principal-engineer review of the backend track. Append-only, newest at the bottom.
Scope per pass: **blocking issues + high-priority items only** (style/polish nits are
skipped). Findings are graded against the `sql-editor-engineering` skill and
`DECISION_LOG.md` (DL-xxx), plus correctness/security and FE↔BE contract consistency.

Grades: **BLOCKER** (must fix before merge/build) · **HIGH** (fix before this area
hardens / before relying on it) · **NOTE** (non-blocking, logged for traceability).

---

## Review R1 — Slice 1: SQL execution pipeline + `POST /query`

- **Date:** 2026-06-19
- **Reviewed:** `src/server/**`, `src/index.ts`, `package.json`, `vitest.config.ts`
  (commit pending; against `BACKEND_BUILD_LOG.md` Slice 1).
- **Verdict:** ✅ **Approve to continue** (Slice 2 not blocked). No hard blockers.
  2 HIGH items to address as the query path hardens.

### What's solid (verified, not just claimed)
- **Contract matches DL-004 exactly.** `RunResponse`/`StatementResult` shapes, 200-with-
  per-statement-errors, stop-on-first-error, `format: 'JSON'`, row cap + `truncated`,
  `elapsedMs = statistics.elapsed * 1000`. FE mirror (`web/src/api/types.ts`) is **identical**
  — no parallel-work drift.
- **DL-005 layering / DIP** is real: the narrow `ClickHouseExecutor` port isolates
  `@clickhouse/client` to `clickhouse.ts`, and `createApp(deps)` is socket-free and injectable.
- **DL-003 splitter** uses the MySQL preset and the tests genuinely cover the risky cases
  (`;` in strings, `''` escaping, line/block comments, backtick identifiers, multi-statement).
- **Per-statement error handling** is correct — execution errors are caught in `runStatement`
  and returned as `status:'error'` data; 500 is reserved for transport faults.
- `npm test` → **41 passed**.

### HIGH-1 — Results are fully buffered into memory before the cap (OOM/resilience risk)
- **Where:** `src/server/clickhouse.ts:56` (query runs with only `format: 'JSON'`) +
  `src/server/routes/query.ts:73-78` (`result.json()` then post-fetch `slice`).
- **Problem:** `ResultSet.json()` buffers the **entire** result set into Node memory before we
  slice to `rowLimit`. This is an editor that runs **arbitrary user SQL** — a single
  `SELECT * FROM <large table>` (or a big `system.*` table) pulls millions of rows into the
  server process, risking OOM / event-loop stalls. The cap currently limits what's *returned to
  the client*, not what's *read from ClickHouse*. DL-009 intent is a genuine server-side cap.
- **Fix (cheap):** push the cap to ClickHouse on data-returning statements via
  `clickhouse_settings: { max_result_rows: rowLimit + 1, result_overflow_mode: 'break' }`
  so CH stops early without erroring; keep the existing slice + `truncated` as belt-and-suspenders.
  Thread `rowLimit` to the executor (e.g. `query(sql, { maxRows })`) so the port stays the owner
  of the CH call. The build log flags this as "future hardening" — raising to HIGH because the
  failure mode is reachable in normal use, not an edge case.

### HIGH-2 — Body-parser errors bypass the JSON error contract (FE↔BE seam)
- **Where:** `src/server/app.ts:20-33` (no error-handling middleware); the route's try/catch
  (`routes/query.ts:30-53`) cannot catch failures thrown by `express.json()` middleware.
- **Problem:** Malformed JSON or a payload over the `2mb` limit makes `express.json()` throw
  **before** the route runs, so Express returns its **default HTML error page** (400/413), not
  `{ error }`. The frontend parses JSON (`{ statements }` / `{ error }`) and will choke on an
  HTML body — breaking the async/error-handling criterion (DL-004) precisely on the bad-input path.
- **Fix:** add a terminal error-handling middleware in `createApp` that returns
  `{ error: <message> }` with an appropriate status (400 for `SyntaxError`/`entity.too.large`,
  500 otherwise). One small function; makes the error contract total.

### NOTES (non-blocking; logged for skill/DL traceability)
- **DL-007 deviation:** `tslint` is still in `devDependencies` and `tslint.json` remains — the
  skill/DL-007 says drop tslint (EOL). Low-effort cleanup. Likewise `body-parser` is now unused
  (replaced by `express.json()`) but still a dependency.
- **`rowCount` semantics:** on truncation, `rowCount` is the *capped* count, so the UI can't show
  "showing N of M total". ClickHouse JSON's `body.rows` gives the read count — surface it as a
  `totalRows`/equivalent when revisiting HIGH-1 (the CH-side cap changes what's available, so
  resolve together).
- **tsconfig split pending (DL-007):** root `tsconfig.json` still has `moduleResolution: "node"`,
  so `tsc --noEmit` trips on vitest 4's own type defs. Not gating (no typecheck script; tests use
  esbuild) and intentionally deferred to avoid clobbering the frontend track — but the split +
  `skipLibCheck` should land so a project typecheck passes.

### Coordination
- FE↔BE contract is currently in sync; **any change to `StatementResult` (e.g. adding `totalRows`
  per the note above) must update `web/src/api/types.ts` in lockstep.**
- Production SPA serving / `GET /` intentionally absent until `dist/public` exists — agreed, not a finding.

---

## Review R2 — re-review of R1 fixes (+ Slice 1b serving, Slice 2 persistence scan)

- **Date:** 2026-06-20
- **Reviewed:** `clickhouse.ts`, `routes/query.ts`, `app.ts` (fixes) + a blocker-scan of the new
  Slice 1b (SPA serving) and Slice 2 (persistence) code. `npm test` → **70 passed**.
- **Verdict:** ✅ **All R1 findings resolved. No new blockers.**

### R1 fixes — verified in code (not just claimed)
- **HIGH-1 (OOM) — RESOLVED.** `QueryOptions.maxRows` → `clickhouse_settings: { max_result_rows,
  result_overflow_mode: 'break' }` (`clickhouse.ts:67-75`); route passes `rowLimit + 1` and slices
  (`query.ts:87-92`). ClickHouse now stops early instead of buffering the full result.
- **HIGH-2 (error contract) — RESOLVED.** Terminal `jsonErrorHandler` (`app.ts:54,59-67`) honours
  `err.status` (400 malformed / 413 oversized), always returns `{ error }`, guards `headersSent`,
  and is mounted last. Malformed-body test added.
- **NOTES — RESOLVED:** `tslint`/`tslint.json` and unused `body-parser` removed; `rowCount`/total
  resolved-by-design (CH-side `break` means the true total isn't available → `truncated` is the
  signal, FE contract unchanged). tsconfig `moduleResolution` split remains deferred (shared w/ FE).
- **Bonus — HIGH-COORD (from FE R1) RESOLVED:** `mountSpa` serves `dist/public` at `/` with an
  API-skipping SPA fallback, guarded by `fs.existsSync` so dev/tests stay API-only; `npm run dev`
  runs server + Vite via `concurrently`.

### Slice 2 (persistence) — blocker-scan, clean
- **No SQL injection:** all access via better-sqlite3 prepared statements (`@param`/`?`); saved
  `sql` is stored as data, never executed.
- **Input validated:** `/api/queries` POST requires non-empty `name`+`sql`; PUT type-checks and
  requires ≥1 field; 404s handled. `createDatabase` defaults to `:memory:` (no implicit file writes).
- Repository-interface/DIP boundary respected; in-memory DB for tests.

### Residual notes (non-blocking)
- **HIGH-1 bound is block-granular.** `result_overflow_mode: 'break'` stops at block boundaries, so
  a statement can buffer up to ~one block (`max_block_size`, default ~65k rows) rather than exactly
  `rowLimit + 1`. Memory is now *bounded* (the core fix) but not a tight 1k bound — acceptable; note
  only if very wide rows become a concern.
- **Coordination:** the new `/api/history` + `/api/queries` contracts (`HistoryEntry`, `SavedQuery`
  in `types.ts`) are **not yet mirrored** in `web/src/api/types.ts`; the FE must add them when it
  builds the history/saved features (now via TanStack Query, DL-020).

---

## Review R3 — Slice 3: `POST /import` (file-import, DL-006)

- **Date:** 2026-06-20
- **Reviewed:** `routes/import.ts` (+ test), `clickhouse.ts` (`insert` port), `app.ts` mount,
  against `BACKEND_BUILD_LOG.md` Slice 3. `npm test` → **84 passed** (unified suite).
- **Verdict:** ✅ **Approve — no blockers, no high-priority issues.**

### What's solid (verified)
- **DL-006 boundary clean:** the import endpoint is the backend half of `fileImportPlugin`;
  `insert` added to the `ClickHouseExecutor` port (ISP/DIP), so the route is mockable and `app.ts`
  reuses the injected `createExecutor`.
- **Input hardened where it matters:** `format` is **whitelisted** (arbitrary strings can't reach
  CH); upload size **capped** (50 MB, memoryStorage → memory-bounded); `file`/`table` presence
  validated → 400.
- **Error contract total:** multer run inline → `LIMIT_FILE_SIZE` = 413, other multer errors = 400,
  insert rejection = 400 with CH's message, unexpected = `next` → terminal JSON handler. All `{ error }`.
- **Correct stream handling:** `Readable.from([buffer], { objectMode: false })` — the object-mode
  bug was caught by E2E and pinned with a `readableObjectMode === false` regression assertion (the
  mock alone wouldn't catch it). Good instinct.
- Mounted before the SPA fallback + error handler; `express.json` doesn't shadow multipart.

### NOTES (non-blocking)
- **`table` identifier is not validated** (only trimmed/non-empty) before reaching
  `client.insert`, which interpolates it into `INSERT INTO <table> …`. I flagged this earlier as a
  security item — but on review it is **not a privilege escalation here**: this is a SQL editor that
  already runs arbitrary SQL via `/query` under the same credentials, so a crafted `table` grants
  nothing new. Worth a small identifier-regex check anyway for **clearer errors** (reject bad names
  up front instead of a confusing CH parse error). Low priority; not a blocker.
- **Whole-file buffering** (memoryStorage) is bounded by the 50 MB cap; disk/stream-through for very
  large files is future hardening — already acknowledged in the build log.

### Coordination
- FE `fileImportPlugin` should `POST /import` as `multipart/form-data` (`file` + `table` + optional
  `format`); success → `{ table, format, rowsWritten?, queryId }`, errors → `{ error }`. No
  `web/src/api/types.ts` change needed beyond an import-result type when the plugin is built.

---

## Review R4 — `/query` request abort / cancellation

- **Date:** 2026-06-20
- **Reviewed:** `routes/query.ts`, `clickhouse.ts` (`abort_signal`), `app.ts` (uncommitted abort
  change; **no build-log entry yet**). `npm test` → **84 passed**.
- **Verdict:** ⚠️ **Abort mechanism is correct, but 1 HIGH to fix before merge** (history pollution).

### What's solid (verified)
- `AbortController` per request; `res.on('close')` aborts **only** when `!res.writableEnded`, so a
  normal completion never false-triggers a cancel. Correct client-disconnect detection.
- `abort_signal` propagated to `client.query` / `client.command`; an aborted statement rejects →
  caught in `runStatement` → returned as an error result → loop breaks. No unhandled rejection.
- `if (!clientGone)` guards both responses, preventing write-after-end / double-response.
- Mirrors the FE's `AbortController` (cancel + supersede, DL-020); no contract/shape change.

### HIGH-1 — cancelled/superseded runs pollute query history
- **Where:** `routes/query.ts:69` (`recordHistory` runs **unconditionally**, before the
  `!clientGone` response guard) and `:76` (catch path).
- **Problem:** The FE aborts the in-flight request on **every supersede** (a new run while one is
  pending) **and** on Cancel (`useRunQuery`, DL-020). Each abort disconnects the socket →
  `clientGone` + `controller.abort()` → the running statement rejects → `runStatement` returns an
  `error` result → `recordHistory(...)` writes a spurious `status:'error'` row (with an abort
  message) to SQLite. So ordinary use spams the history log with junk error entries — degrading the
  history feature (DL-013) the moment its UI lands (Slice 3).
- **Fix:** only record runs the client actually waited for — move `recordHistory(...)` **inside the
  `if (!clientGone)`** block in both the `try` and `catch`. (Alternatively log a distinct
  `'cancelled'` status, but skipping is simplest and matches "history = runs you ran".)

### NOTES (non-blocking)
- `/import` is not abortable (no `signal`) — acceptable for now; uploads differ.
- Server-side cancellation is best-effort: aborting the HTTP request drops the connection, and
  ClickHouse cancels the running query on client disconnect for typical SELECTs. Fine.
- **Process:** add a `BACKEND_BUILD_LOG.md` entry for this abort slice for traceability.

> **Update (R5):** the abort change was **reverted**, not merged — so HIGH-1 below no longer applies.

---

## Review R5 — re-review of committed backend (import validation + abort revert)

- **Date:** 2026-06-20
- **Reviewed:** committed `main` through `f0e0d44`; `routes/import.ts`, `clickhouse.ts`,
  `routes/query.ts`. `npm test` → **88 passed**.
- **Verdict:** ✅ **Approve — no blockers.**

- **R3 NOTE (table identifier) — RESOLVED** (`f0e0d44`). `import.ts` validates `table` against
  `^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$` (allows `db.table`) and returns a clear
  400 before reaching `insert`. The code comment correctly frames it as a clarity check, not a
  security control (matches the R3 rationale). Good.
- **Abort/cancellation (R4) — REVERTED.** The committed `query.ts`/`clickhouse.ts` are the
  pre-abort version: no `AbortController`, no `signal`/`abort_signal`, no orphaned dead code (clean
  revert). Therefore **R4 HIGH-1 (history pollution on cancel/supersede) no longer applies.**
- **NOTE — server-side cancellation is currently absent.** The FE Cancel/supersede aborts the
  client fetch only; the ClickHouse query runs to completion server-side (best-effort cancel on
  connection drop). This is the original design and not a regression from any committed state. If
  re-introduced, do it **with** the R4 fix (skip `recordHistory` when `clientGone`). Decision, not
  a blocker.

Net: the backend base product (query pipeline · persistence · serving · file-import) is complete
and all review findings are cleared.

---

## Review R6 — backend tests driven by the golden dataset (DL-016)

- **Date:** 2026-06-20
- **Reviewed:** `40f4ab1`; golden blocks in `splitStatements.test` / `classify.test` /
  `query.test`. `npm test` → **103 passed**.
- **Verdict:** ✅ **Approve.** Resolves **FE review R4 NOTE-1** — DL-016 is now fully realized
  (the shared `web/src/data/goldenQueries.ts` is the single source for the FE Examples picker
  **and** the backend fixtures).
- **Substantive, not hollow:** splitter asserts clean/trimmed/non-empty statements, no trailing
  `;`, correct count (multi = 3); classifier asserts `CREATE;INSERT;SELECT` →
  `[command, command, query]`; `/query` route asserts 200 + per-statement count + all success
  (shape/ordering — real error semantics remain covered by the dedicated stop-on-first-error test).
- **NOTE (non-blocking):** the deep relative import `../../../web/src/data/goldenQueries` is a
  little brittle; a path alias would be tidier. Test-only.

---

## Review R7 — golden dataset expansion + robust assertions (DL-016)

- **Date:** 2026-06-20
- **Reviewed:** `web/src/data/goldenQueries.ts` (5 → 12 queries) + `classify` / `splitStatements`
  / `query` golden-test changes. `npm test` → **125 passed**.
- **Verdict:** ✅ changes are good — **but 1 BLOCKER (untracked shared file).**

### Solid
- **Broader coverage:** CTE + window, arrays/maps/lambdas, join + subquery, a DDL statement, a
  longer 5-statement CRUD script, a large/truncated result (`numbers(100000)`), and tricky
  in-string `;`/`--` literals (an excellent splitter guard).
- **Assertions made robust/derived** (not hardcoded): statement count from
  `splitStatements(golden.sql).length`; multi-statement asserts `length > 1` + contains
  `command` and `query` (rather than an exact triple); every kind ∈ `{query, command}`; the
  `ddl` category → `command` verified. The dataset can now grow without brittle breakage.

### 🔴 BLOCKER-1 — `web/src/data/goldenQueries.ts` is untracked but imported by committed code
- **Evidence:** `git ls-files web/src/data/goldenQueries.ts` → empty (never committed). Imported by
  **committed** backend tests (`40f4ab1`) **and** the **committed** frontend `examplesPlugin`
  (`3c1302f`).
- **Impact:** a fresh `git clone && npm i && npm test` (and `npm run build`) **fails** — the import
  target isn't in git. Works locally only because the file is present in the working tree. This is a
  broken-on-clone / would-break-CI defect.
- **Fix:** commit `web/src/data/goldenQueries.ts` **together with** the updated backend test files
  (`classify.test` / `splitStatements.test` / `query.test`) — they're co-dependent: the previously
  committed tests assert hardcoded counts incompatible with the expanded dataset, so splitting them
  apart breaks the tree either way.
- **Coordination:** assign clear ownership of `web/src/data/goldenQueries.ts` (the shared DL-016
  artifact) so it isn't dropped from commits again.

---

## Review R8 — error + long-query golden examples (`0c574e2`, DL-016)

- **Date:** 2026-06-20
- **Reviewed:** `0c574e2` — golden dataset +6 (5 `error` modes + 1 long single statement) and the
  `classify.test` `error` branch. `npm run test:server` → **133 passed**.
- **Verdict:** ✅ **Approve — no blockers.**
- **Solid:** 5 distinct failure modes (unknown function / unknown column / type-conversion /
  divide-by-zero / syntax) exercise the real error path, verified vs live ClickHouse. The classifier
  golden test now treats `error` as **kind-agnostic** (length 1, no kind assertion) — correct, since
  invalid SQL has no meaningful leading-keyword kind. The long example is a **flat 2000-element IN
  list** (not a deep UNION) to dodge ClickHouse parse-depth limits — thoughtful. R7's derived
  assertions absorbed the new rows with no edits to `splitStatements`/`query` tests.
- **NOTE — not a backend issue:** backend is green in isolation (133), but the **unified `npm test`
  is RED** due to the *frontend* Slice 3b (uncommitted): `examplesPlugin` now calls `useTheme()` and
  `PluginBar.test` renders without a `<ThemeProvider>`. Flagged for the frontend review.

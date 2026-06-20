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

# Implementation Plan — ClickHouse SQL Web Editor

> Companion docs: `DECISION_LOG.md` (why) and `SPIKE-buy-vs-build.md` (buy-vs-build evidence).

## Context

The repo (`clickhouse-express-demo`) is currently a minimal Express + TypeScript
backend that proxies SQL to a ClickHouse container:

- `GET /` → returns `"Hello world!"`.
- `POST /query` → forwards `x-clickhouse-*` headers, runs a **single** statement via
  `@clickhouse/client` (`format: 'JSONEachRow'`), returns `{ rows }` (no column metadata).
- ClickHouse runs via `docker-compose.yml` (HTTP `:8123`). No frontend tooling exists.

The assignment is to build a **React SQL web editor**: opening `/` renders an editor where
users write and execute SQL; results display in the UI; **multi-statement scripts** are
supported; **file import** is a bonus.

This plan delivers a maintainable, extensible base product first, with file import slotted
in later as an editor **plugin**. It is judged on architecture, readability, component
design, state management, async/error/loading handling, UX, and trade-off reasoning.

## Goals & scope

**In scope (now)**
- Vite + React + TypeScript frontend served at `/`.
- SQL editor (CodeMirror 6) with run controls.
- Backend that splits multi-statement scripts, executes them in order, and returns
  per-statement results with columns, types, row counts, timing, and errors.
- Results UI: per-statement panels (table for data, "executed" note for commands, error banner).
- **Persistence**: run **history** (auto-logged) + **saved queries** (explicit, named, for re-use),
  backed by a lightweight embedded SQLite DB (DL-013).
- Schema-aware autocomplete, cached via TanStack Query (DL-020).
- Light/dark theming via Click UI tokens + a `ThemeProvider`/switcher (DL-021).
- Layered, plugin-extensible architecture per the driving principles.

**Deferred (designed-for, not built)**
- File import — implemented later as a `fileImportPlugin` + `POST /import` (multer). The
  plugin seam is built now (see DL-006).

## Driving principles (per user)

- Avoid over-engineering; follow **SOLID**.
- Separate **business logic** from **pure presentational** components.
- **Hooks** for the business-logic layer; **Context/providers** for state.
- State in **plain split React Context + `useReducer` + action creators** — one provider per concern, isolated by context (DL-019/DL-022, supersedes DL-012).
- **Container/presentational split** (`components/` pure, `containers/` connected, `App` reads no state) — DL-023.
- **Theming** via Click UI tokens + `ThemeProvider`/switcher; no hardcoded colors (DL-021).
- Extract business-logic flows into **services/providers** where it makes sense.
- **Memoization** to prevent unnecessary re-renders.
- Shared components — **reusable but not speculative** (DL-008).
- **Click UI components first** — build a custom component only when Click UI lacks it (DL-017).
- **Addons (e.g. file upload) are editor plugins** (DL-006).
- **Unit-test** the most important systems/services/user paths — pragmatic, not exhaustive (DL-015).

## Evaluation criteria — how this design satisfies each (must be rock-solid)

These six criteria are the bar (DL-011). Every design choice traces to one or more.

| Criterion | How we satisfy it (rock-solid) |
|---|---|
| **Code organization & overall architecture** | Four explicit layers (presentation / state / hooks / services) with inward-only dependencies; backend split into `app` + `routes` + `sql` + `clickhouse` modules. Plugin registry (OCP) keeps the core closed to modification, open to extension. Each file has one reason to change (SRP). |
| **Readability & maintainability** | Small, named, single-purpose modules; domain types shared (`StatementResult`, `RunResponse`); shared-but-not-speculative components (DL-008); no clever indirection. Decisions are documented in `DECISION_LOG.md` so intent is recoverable. |
| **Component design & state management** | Pure, `React.memo`'d presentational components (props only); business logic in hooks; state in Context/providers **split by update frequency** (DL-010) with **one small provider per concern** (Context + `useState`, DL-019) so typing never re-renders results. Click UI primitives for consistent, accessible UI. |
| **Async flows, loading states, errors** | Run-query via TanStack Query `useMutation` (idle/pending/success/error) with `AbortSignal` cancellation (DL-020). Backend returns **per-statement** success/error with stop-on-first-error; UI shows explicit running/empty/error states and "remaining statements not run". Transport vs SQL errors are distinguished. |
| **Basic UX & usability** | CodeMirror editor (highlighting, line numbers), Run/Cancel button, per-statement timing + row counts, truncation notice for large results, last-script persistence. |
| **Thoughtfulness in trade-offs** | Every buy-vs-build call is reasoned and recorded (`SPIKE-buy-vs-build.md` + `DECISION_LOG.md`), including what we deliberately deferred (file import, virtualization, custom ClickHouse dialect) and why. |

## Architecture

Four layers, dependencies pointing inward (UI → hooks → services → types):

```
┌─────────────────────────── Presentation (pure, React.memo, Click UI) ───────────────────────────┐
│  Toolbar · RunButton · EditorSurface · ResultsPanel · StatementResultCard · ResultTable ·        │
│  ErrorBanner · StatusBar · (future) ImportDialog                                                 │
└───────────────▲──────────────────────────────────────────────────────────────────────────────── ┘
                │ props + stable callbacks
┌──────────────┴── State (plain Context + useState, one provider per concern — DL-010/DL-019) ──────┐
│  ClickUIProvider → QueryClientProvider (TanStack, server state) → EditorProvider (doc + plugins)  │
│  thin useContext wrappers split by frequency (useEditorDoc/IsEmpty/Actions, useQuery, ...)         │
└───────────────▲────────────────────────────────────────────────────────────────────────────────┘
                │ reads its provider
┌───────────────┴── Business logic (hooks) ──────┐   ┌── Services (framework-agnostic TS) ─────────┐
│  TanStack hooks · editor hooks · usePlugins     │──▶│  typed fetch fns (api/) · domain types        │
└─────────────────────────────────────────────────┘   └──────────────────────────────────────────────┘
```

### Plugin system (editor addons) — DL-006

```ts
interface ToolbarAction { id: string; label: string; icon?: string; run(ctx): void; }
interface EditorPlugin {
  id: string;
  toolbarActions?: ToolbarAction[];
  commands?: { key: string; run(ctx): boolean }[];   // wired into the CM keymap
  panels?: PanelContribution[];                       // optional dialogs/side panels
  codeMirrorExtensions?: Extension[];                 // optional CM6 extensions
}
```

- `PluginProvider` holds a registry; `Toolbar` renders `toolbarActions`, `EditorSurface`
  mounts `codeMirrorExtensions`, a panel host renders `panels`.
- Core **Run** stays built-in (not a plugin) to avoid over-engineering.
- **File import (future)** = `fileImportPlugin` contributing an "Import" toolbar action +
  a Click UI Dialog panel → `apiClient.importFile()`. Not built now; the seam is.

### SOLID mapping (brief)

- **SRP** — presentation renders, hooks orchestrate, services do IO.
- **OCP** — add features via plugins without editing editor core.
- **ISP** — small interfaces (`EditorPlugin`, `ToolbarAction`).
- **DIP** — components depend on hook/service abstractions; `apiClient` is provided via
  context so it can be swapped/mocked in tests.

## Backend changes

Refactor the single `src/index.ts` into focused modules and redesign `/query` (DL-004).

```
src/
  index.ts                 # entry: create app, prod SPA static serving, listen
  server/
    app.ts                 # express app factory; mounts routes; static+SPA fallback in prod
    clickhouse.ts          # createClient + x-clickhouse-* header forwarding (lifted from index.ts)
    routes/query.ts        # POST /query: split → classify → execute → auto-log history
    routes/history.ts      # GET/DELETE /api/history (run log)
    routes/queries.ts      # GET/POST/PUT/DELETE /api/queries (saved queries)
    routes/import.ts       # (future) POST /import (multer) — file upload plugin backend
    sql/splitStatements.ts # wraps dbgate-query-splitter (DL-003)
    sql/classify.ts        # leading-keyword classifier (query vs command)
    db/db.ts               # better-sqlite3 connection + schema migration on boot (DL-013)
    db/historyRepository.ts    # interface + SQLite impl (list/get/create/delete/clear)
    db/savedQueryRepository.ts # interface + SQLite impl (list/get/create/update/delete)
    types.ts               # StatementResult, RunResponse, ColumnMeta (shared shapes)
```

**`POST /query` behavior** (DL-004):
1. Validate `{ query }` (400 if missing/empty).
2. Split into statements (`dbgate-query-splitter`).
3. Classify each: data-returning (`SELECT/WITH/SHOW/DESCRIBE/EXPLAIN/EXISTS`) →
   `client.query({ query, format: 'JSON' })`; else → `client.command({ query })`.
4. Execute sequentially, **stop on first error**.
5. Respond **200** with `{ statements }` (per-statement errors included as data).

**Response shape:**
```ts
type ColumnMeta = { name: string; type: string };
type StatementResult = {
  statement: string;
  kind: 'query' | 'command';
  status: 'success' | 'error';
  columns?: ColumnMeta[];                 // query
  rows?: Record<string, unknown>[];       // query (capped, DL-009)
  rowCount?: number;
  truncated?: boolean;                    // rows capped at limit
  elapsedMs?: number;
  queryId?: string;
  error?: { message: string };            // error
};
type RunResponse = { statements: StatementResult[] };
```

- Use `format: 'JSON'` to get `meta`/`rows`/`statistics.elapsed` for free.
- Cap returned rows server-side (default 1000) with `truncated`.
- Preserve the existing `x-clickhouse-*` header forwarding in `clickhouse.ts`.

## Persistence — query history & saved queries (DL-013)

Embedded SQLite via `better-sqlite3`, behind **repository interfaces** (DIP) so the engine is
swappable and unit-testable with an in-memory fake.

**Data model (two tables, distinct lifecycles):**
```sql
query_history( id, sql, executed_at, status /* success|error */,
               statement_count, elapsed_ms, error )   -- auto-logged on every run
saved_query(   id, name, sql, created_at, updated_at ) -- explicit, named, for re-use
```

**Repositories (`src/server/db/`):** `db.ts` opens the file + migrates schema on boot;
`historyRepository` and `savedQueryRepository` expose interfaces + SQLite impls.

**Endpoints:** `POST /query` auto-records a history row (success or error).
`GET /api/history`, `DELETE /api/history/:id`, `DELETE /api/history` (clear).
`GET|POST /api/queries`, `PUT|DELETE /api/queries/:id`.

**Frontend** — surfaced as **editor plugins** (consistent with DL-006):
`historyPlugin` (a History flyout listing recent runs; click to load) and `saveQueryPlugin`
(a "Save query" toolbar action + Saved list). Data via **TanStack Query** (`useHistory` /
`useSavedQueries` = `useQuery`); save/delete mutations call `invalidateQueries` (DL-020).

## Caching strategy (DL-020)

**TanStack Query is the server-state layer**; we do not hand-roll caches. Policy:

- **Schema/autocomplete metadata — cache (worth it).** `useSchema` (`useQuery` from
  `system.columns` / `SHOW TABLES`) with a long `staleTime` + a manual "refresh schema" refetch.
  Avoids re-querying on every keystroke.
- **Query results — never cached** (freshness/correctness): run-query is a `useMutation`, which
  doesn't cache. ClickHouse's own query cache is an optional server-side toggle, not an app concern.
- **History & saved queries — `useQuery`**, refreshed by `invalidateQueries` on save/delete; no
  bespoke store.
- **Render caching** via `React.memo` + context-splitting (DL-010/DL-019); **asset caching**
  via Vite content-hashed bundles. Both free.

## Frontend structure

```
web/
  index.html
  tsconfig.json
  src/
    main.tsx                       # ClickUIProvider + QueryClientProvider + EditorProvider tree
    App.tsx                        # layout: editor pane / results pane
    api/
      client.ts                    # thin typed fetch fns (runQuery, history, savedQueries, schema)
      queries.ts                   # TanStack hooks: useRunMutation, useHistory, useSavedQueries, useSchema (DL-020)
      types.ts                     # mirrors src/server/types.ts (RunResponse, StatementResult)
    state/                         # Context + useReducer — UI state (DL-019/DL-022)
      EditorProvider.tsx           # SQL document
      ThemeProvider.tsx            # light/dark theme → ClickUIProvider (DL-021)
      PluginRegistry.ts            # register/list plugins
    containers/                    # connected wrappers (consume hooks/providers) — DL-023
      EditorPane.tsx  RunControls.tsx  ResultsRegion.tsx  ThemeSwitcher.tsx
    data/
      goldenQueries.ts             # curated golden dataset — powers UI + tests (DL-016)
    hooks/
      (editor hooks)               # useEditorDoc / useEditorIsEmpty / useEditorActions — split by frequency (DL-010), from state/EditorProvider
      usePlugins.ts                # access registry
    components/                    # pure + memoized; COMPOSE Click UI primitives first (DL-017)
      RunButton.tsx                # Click UI <Button>
      EditorSurface.tsx            # CodeMirror — sanctioned custom (Click UI has no editor, DL-002)
      ResultsPanel.tsx             # Click UI <Container> hosting per-statement cards
      StatementResultCard.tsx      #   Click UI <Panel> + <Badge>/<Text> (Card* has no children slot, DL-017)
      ResultTable.tsx              #   Click UI <Table> (do NOT hand-roll a data grid)
      ErrorBanner.tsx              #   Click UI <Alert>
      StatusBar.tsx                #   Click UI <Text>/<Badge> in a thin layout strip
      Toolbar.tsx                  # thin layout header (no Click UI toolbar primitive); actions = Click UI <Button>s
    plugins/
      types.ts                     # EditorPlugin, ToolbarAction interfaces
      historyPlugin.tsx            # History flyout (DL-013)
      saveQueryPlugin.tsx          # "Save query" action + saved list (DL-013)
      examplesPlugin.tsx           # Golden-dataset "Examples" picker (DL-016)
      (fileImportPlugin.tsx)       # FUTURE — example/seed of the addon pattern
```

**Async via TanStack Query** (DL-020): run-query is a `useMutation` whose states
(`isIdle`/`isPending`/`isSuccess`/`isError`, `data`, `error`) drive the UI — no hand-rolled state
machine. The mutation fn passes an `AbortSignal` so a new run cancels the in-flight one (wired to a
Cancel button). History/saved/schema are `useQuery`; save/delete call `invalidateQueries`.

**Cheap, high-value UX:** per-statement elapsed/rowCount,
explicit loading/empty/error states, "remaining statements not run" on error, persist last
script to `localStorage`.

## Tooling & serving (DL-007)

- **New deps:** `react`, `react-dom`, `@tanstack/react-query`, `@clickhouse/click-ui`,
  `styled-components`, `dayjs`, `@uiw/react-codemirror`, `@codemirror/lang-sql`,
  `dbgate-query-splitter`, `better-sqlite3`.
- **New devDeps:** `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`,
  `concurrently`, `@types/better-sqlite3`, `vitest`, `@testing-library/react`,
  `@testing-library/user-event`, `supertest`. **Upgrade** `typescript`→`^5.4`,
  `@types/node`→`^20`. **Drop** `tslint`. (Later, for the import plugin: `multer`, `@types/multer`.)
- **Scripts:**
  ```jsonc
  "dev":   "concurrently -n server,web \"tsx watch src/index.ts\" \"vite\"",
  "build": "vite build",                                  // → dist/public
  "start": "NODE_ENV=production tsx src/index.ts"         // serves dist/public at /
  ```
- **`vite.config.ts`:** `root: 'web'`, `@vitejs/plugin-react`, `build.outDir: '../dist/public'`,
  dev `server.proxy` for `/query` (and later `/import`) → `http://localhost:8080`.
- **Express prod:** `express.static(dist/public)` + SPA fallback, mounted **after** API routes;
  replace the `GET /` "Hello world!" handler.
- **tsconfig split:** backend (`commonjs`, excludes `web/`); `web/tsconfig.json`
  (`jsx: react-jsx`, `moduleResolution: bundler`); `tsconfig.node.json` for the Vite config.
- Same-origin (dev proxy + prod static) → **no CORS**.

## Testing strategy (DL-015)

**Pragmatic, not exhaustive** — cover the highest-risk systems, services, and one or two
critical user paths; don't chase coverage. Tooling: **Vitest** (shared by FE/BE),
`@testing-library/react` + `user-event` for components/hooks, `supertest` for the Express API.

Priority targets (the things most likely to break or to be wrong):
- **`sql/splitStatements` + `sql/classify`** — unit tests over the **golden dataset** + tricky
  edge cases (`;` in strings, `''` escaping, `--` / `/* */` comments, query vs command). This is
  the riskiest backend logic (DL-003).
- **Repositories** (`historyRepository`, `savedQueryRepository`) — CRUD against an in-memory
  SQLite, exercising the interface (DL-013).
- **`POST /query` route** — supertest: single statement, multi-statement, stop-on-first-error,
  history auto-logging (mock the ClickHouse client).
- **Run mutation hook** — TanStack `useMutation` (wrapped in `QueryClientProvider`):
  pending→success/error transitions and `AbortSignal` cancellation.
- **One critical UI path** — type a query → Run → results render; and load a golden example →
  Run → table appears (Testing Library).

Out of scope for now: exhaustive component snapshots, Click UI internals, ClickHouse itself.

## Golden dataset (DL-016)

A curated set of SQL queries that is **both** a live UI feature **and** the test corpus —
one source of truth (`web/src/data/goldenQueries.ts`, importable by backend tests):

```ts
type GoldenQuery = {
  id: string; title: string; description: string;
  category: 'select' | 'ddl' | 'multi-statement' | 'error' | 'system';
  sql: string;
};
```

Coverage spans the features we demo and test: a simple `SELECT 1`; a `system.tables` browse;
a **multi-statement** script (`CREATE … ; INSERT … ; SELECT …` on a `Memory`-engine table so
it's self-contained); a deliberately **invalid** query (to show the error path); and a couple
of aggregations. **In the UI**, the `examplesPlugin` renders these as a selectable
"Examples" list (Click UI) — pick one to load it into the editor and Run, so the editor can be
seen in action immediately. **In tests**, the same array feeds the splitter/classifier and the
`POST /query` route tests as fixtures.

## Phasing

1. **Tooling/serving** — blank React app renders at `/` in dev and prod (de-risks everything).
2. **Backend query** — split + classify + sequential execute; `RunResponse`. **Tests:** splitter + classifier.
3. **Persistence** — SQLite repos + `/api/history` + `/api/queries`; `/query` auto-logs. **Tests:** repositories + `/query` route (supertest).
4. **Data + state + hooks** — TanStack Query hooks (run `useMutation`; history/saved/schema `useQuery`) + Context `useState` (UI). **Tests:** run mutation hook.
5. **Editor + results UI** — CodeMirror surface, toolbar, per-statement results (features 1 & 2) + golden dataset + `examplesPlugin`. **Tests:** one critical UI path.
6. **Plugins** — history / saveQuery / examples wired; plugin seam ready for file import (no upload yet).
7. **Docs** — update root `README.md` (scripts, decisions, limitations); keep this `claude/` folder current.
8. **(Later)** File import plugin + `/import` endpoint.

## Risks & trade-offs

- **TypeScript 4.9 → 5.x / `@types/node` 16 → 20** upgrade is mandatory for Vite/React types.
- **dbgate-query-splitter has no certified ClickHouse dialect** → choose closest preset and
  unit-test ClickHouse edge cases (`''` escaping, backticks, comments); custom options as fallback.
- **Context re-renders** → split contexts by update frequency + memoize (DL-010).
- **Large result sets** → server-side row cap + `truncated` notice; virtualization deferred (DL-009).
- **Plugin system kept minimal** by design (no event bus/lifecycle) to avoid over-engineering.
- **Click UI** requires `<ClickUIProvider>` + `styled-components` peer; styles load via its import
  graph — no manual `cui.css` import on v0.6.1 (DL-001/DL-021).

## Feature scope vs. ClickHouse SQL Console (DL-024)

Benchmarked against ClickHouse Cloud's SQL Console. Most of its surface is out of scope here; we
adopt the high-leverage, low-cost gaps — each an editor plugin / toolbar action (DL-006):

- **Export results as CSV** (results-pane toolbar action).
- **Schema browser sidebar** (databases → tables → columns) over `system.tables`/`system.columns`,
  feeding the planned autocomplete (DL-014 → DL-020).
- **Result search** + **client-side column sort** on the results grid.
- **Saved-query polish**: Cmd/Ctrl+S to save + inline rename (with the Slice-3 saved-queries UI).

Already on the roadmap (Slice 3): history UI, saved-queries UI, examples (golden dataset), schema
autocomplete, file-import plugin.

**Deliberately deferred / out of scope** (trade-off, not omission): charts/visualizations; GenAI
NL→SQL & "Fix Query"; multiple query tabs; sharing/collaboration (needs auth/multi-user);
server-side pagination (we cap results at 1000 — DL-009); filter→SQL builder.

## Verification

1. `docker compose up -d` → ClickHouse on `:8123`.
2. `npm i`.
3. **Dev:** `npm run dev` → open the Vite URL; editor renders; `/query` proxies to `:8080`.
4. **Prod-like:** `npm run build && npm run start` → open `http://localhost:8080/`; SPA served at `/`.
5. **Functional:**
   - Single query: `SELECT 1` → one result table.
   - Multi-statement: `CREATE TABLE t (a UInt8) ENGINE=Memory; INSERT INTO t VALUES (1),(2); SELECT * FROM t;`
     → command notes + a data table, in order.
   - Error handling: a bad statement mid-script → error banner + "remaining not run".
   - Loading/cancel: long query shows running state; Cancel aborts.
   - **Golden examples:** open the Examples picker, load one, Run → expected result (live demo).
   - **Persistence:** Run a few queries → History lists them (incl. failures); Save a named query →
     reload page → it persists; click a saved/history item → loads into the editor.
   - **Autocomplete:** type a table name → suggestions from cached schema; "refresh schema" after a CREATE.
6. **Backend:** exercise `src/requests.http` against the new response shape.
7. **Automated tests:** `npm test` (Vitest) — splitter/classifier, repositories, `/query` route,
   the run `useMutation` hook, and one UI path (DL-015).
8. **(Later)** import plugin: upload a CSV into a table, confirm rows written.

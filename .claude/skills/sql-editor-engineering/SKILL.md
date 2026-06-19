---
name: sql-editor-engineering
description: MUST READ before writing or modifying any code in this ClickHouse SQL Editor repo. Defines the mandatory architecture, technical (buy-vs-build) decisions, and engineering principles every agent must follow when building features here (frontend React/Click UI, Express/ClickHouse backend, SQLite persistence, editor plugins, testing). Load this before planning or editing code.
---

# SQL Editor — Engineering Playbook

This is the binding engineering contract for this repo. **Follow it before and while writing
any code.** The authoritative rationale for every rule lives in `claude/DECISION_LOG.md`
(entries `DL-xxx`); the full plan is in `claude/IMPLEMENTATION_PLAN.md`. If a decision here
seems wrong for a new situation, **add a new entry to the decision log** rather than silently
diverging.

## What we're building

A React SQL web editor served at `/` by the existing Express app. Users write and run SQL
(single statement and **multi-statement scripts**) against a ClickHouse container; results show
per statement. Persisted **query history** + **saved queries**. File import is a **future**
feature, designed to slot in as an editor plugin.

## Evaluation bar (optimize for these — DL-011)

1. Code organization & architecture · 2. Readability & maintainability · 3. Component design &
state management · 4. Async flows / loading / errors · 5. Basic UX & usability · 6. Thoughtful
trade-offs. These must be rock-solid; every choice should trace to one or more.

## Non-negotiable principles

- **Avoid over-engineering. Follow SOLID.** Keep abstractions minimal and justified.
- **Separate business logic from presentation.** Presentational components are **pure**,
  props-only, and wrapped in `React.memo`. No data-fetching or business logic inside them.
- **Business logic lives in hooks; state lives in React Context/providers.** Extract whole
  business-logic flows into **services**/providers where it makes sense.
- **Read state via the selector pattern (DL-012).** Never consume a context with raw
  `useContext` for data — subscribe to the **minimal slice** via selector hooks
  (`useQuerySelector(s => s.status)`), backed by `useSyncExternalStore`. Read **actions** from a
  separate stable handle so calling them never re-renders.
- **Split context/state by update frequency (DL-010)** so editing never re-renders results.
  Use `useMemo`/`useCallback` to stabilize values and callbacks.
- **Click UI components first (DL-017).** Always use an existing `@clickhouse/click-ui`
  component before building a custom one. Build custom **only** when Click UI lacks it, and wrap
  it to match the design system.
- **Shared but not speculative (DL-008).** Make components reusable, but extract a shared
  abstraction only when a real second use appears — not preemptively.
- **Addons are editor plugins (DL-006).** New optional features (e.g. file import, history,
  saved queries, examples) attach via the plugin registry — never bolted into editor core (OCP).
- **Test the important things, pragmatically (DL-015).** Some tests are required; don't chase
  coverage.

## Architecture (layers; dependencies point inward)

`Presentation (pure, memoized, Click UI)` → `State (Context/providers, selector reads)` →
`Business logic (hooks)` → `Services (framework-agnostic TS)` → `Domain types`.

### Frontend (`web/`)
- `components/` — pure, memoized, Click UI-based, props only.
- `state/` — `createStore.ts` (tiny `useSyncExternalStore` factory), providers
  (`EditorProvider`, `QueryProvider`, `HistoryProvider`, `SavedQueriesProvider`,
  `SchemaProvider`), `PluginRegistry`.
- `hooks/` — `useRunQuery` (async state machine), `useEditorSelector`/`useQuerySelector`
  (selectors), `useEditor`, `usePlugins`.
- `services/` + `api/apiClient.ts` — typed fetch wrappers, AbortSignal; no React.
- `plugins/` — `EditorPlugin`/`ToolbarAction` interfaces; `historyPlugin`, `saveQueryPlugin`,
  `examplesPlugin`; (future) `fileImportPlugin`.
- `data/goldenQueries.ts` — the golden dataset (also used by tests).

### Backend (`src/server/`)
- `routes/query.ts` — `POST /query`: split → classify → execute sequentially → per-statement
  results; **auto-logs history**.
- `routes/history.ts`, `routes/queries.ts` — `/api/history`, `/api/queries`.
- `sql/splitStatements.ts` (wraps `dbgate-query-splitter`), `sql/classify.ts`.
- `db/` — `better-sqlite3` connection + `historyRepository`/`savedQueryRepository` (interfaces
  + SQLite impls).
- `clickhouse.ts` — `createClient` + `x-clickhouse-*` header forwarding.

## Key technical decisions (with rationale refs)

- **Editor: CodeMirror 6** via `@uiw/react-codemirror` + `@codemirror/lang-sql` (DL-002). Click
  UI has no editor. Cmd/Ctrl+Enter to run via keymap; CM extensions are the low-level plugin seam.
- **Statement splitting: `dbgate-query-splitter`** on the **backend** (DL-003). No certified
  ClickHouse dialect → **unit-test edge cases** (`''` escaping, backticks, `--`/`/* */`
  comments, `;` in strings).
- **Multi-statement execution (DL-004):** classify by leading keyword. Data-returning
  (`SELECT/WITH/SHOW/DESCRIBE/EXPLAIN/EXISTS`) → `client.query({ format: 'JSON' })` (gives
  `meta`+`rows`+`statistics`); else → `client.command()`. Execute in order, **stop on first
  error**. Return HTTP **200** with `{ statements: StatementResult[] }` (per-statement errors are
  data). Cap rows server-side (default 1000) with a `truncated` flag.
- **Persistence: `better-sqlite3`** behind repository interfaces (DL-013). `query_history`
  (auto) + `saved_query` (explicit). DB file is gitignored.
- **Caching (DL-014):** none general. Cache **only** schema/autocomplete metadata client-side
  (`SchemaProvider`, manual refresh). Never cache query results. History/saved live in their
  in-memory store.
- **Async state (DL-004/DL-015):** `useRunQuery` is a discriminated union
  (`idle|running|done|error`) with `AbortController` cancellation. Always render explicit
  loading/empty/error states; distinguish transport errors from per-statement SQL errors.

## Tooling

Vite + React 18 + **TypeScript 5.x** (`@types/node` 20; `tslint` dropped). `npm run dev`
(concurrent Express + Vite proxy `/query`,`/api/*` → :8080), `npm run build` (→ `dist/public`),
`npm run start` (Express serves the built SPA at `/`). Same-origin → no CORS. `npm test` = Vitest.

## Golden dataset (DL-016)

`web/src/data/goldenQueries.ts` is the single source for the in-UI Examples picker **and** test
fixtures. Cover: simple SELECT, `system.tables`, a self-contained multi-statement
`CREATE/INSERT/SELECT` (Memory engine), a deliberately invalid query, and aggregations.

## Required tests (pragmatic — DL-015)

`splitStatements` + `classify` (over the golden dataset + edge cases); repositories (in-memory
SQLite); `POST /query` (supertest, ClickHouse mocked); `useRunQuery`; one UI path. Don't test
Click UI internals or ClickHouse itself.

## Before you start building — checklist

1. Read the relevant `DL-xxx` entries for the area you're touching.
2. Put new state in a provider; read it via selectors; keep components pure + memoized.
3. Check Click UI for a component **before** writing one.
4. Add optional features as plugins, not core edits.
5. Add/extend the few required tests for what you changed.
6. If you make a new pertinent decision, **append it to `claude/DECISION_LOG.md`** and update
   this skill + `CLAUDE.md` if it changes a rule.

# CLAUDE.md

Guidance for any agent working in this repo. **This file is always loaded — read it first.**

## ⛔ Before writing or modifying ANY code: load the engineering skill

**You MUST read the `sql-editor-engineering` skill** (`.claude/skills/sql-editor-engineering/SKILL.md`)
before planning or editing code here. It is the binding engineering contract. The full rationale
for every rule is in `claude/DECISION_LOG.md` (entries `DL-xxx`); the plan is in
`claude/IMPLEMENTATION_PLAN.md`.

> Two `claude` locations, don't confuse them:
> - `claude/` — human docs (plan, decision log, buy-vs-build spike).
> - `.claude/skills/` — the machine-loaded engineering skill.

## What this is

A React SQL web editor served at `/` by an Express app, running SQL (single + multi-statement)
against a ClickHouse container; results shown per statement, with persisted history and saved
queries. File import is a future, plugin-based feature.

## Condensed rules (authoritative detail in the skill + decision log)

- **Avoid over-engineering; follow SOLID.**
- **Pure presentational components** (props only, `React.memo`); **business logic in hooks**;
  **state in React Context/providers**.
- **UI state = plain split React Context + `useReducer` + action creators** (DL-019/DL-022) — one
  provider per concern (editor doc, theme, plugins), isolated by context so typing never re-renders
  results (DL-010); reducers pure, side effects in `useEffect`; memoize each `value`. No custom store
  / selector lib; add Zustand only on *measured* churn.
- **Server state = TanStack Query (DL-020)** — `useMutation` for run-query (never cached),
  `useQuery` + `invalidateQueries` for history/saved/schema. Don't hand-roll fetch/cache/abort.
- **Click UI first (DL-017)** — use `@clickhouse/click-ui` before building a component; surfaces =
  `Panel`/`Container`/`Separator` (`Card*` have no children slot); style via design tokens, not hex.
  Custom only for the editor (CodeMirror, DL-002) + layout shell.
- **Theming (DL-021)** — `ThemeProvider` drives Click UI light/dark + `data-cui-theme`; `ThemeSwitcher` toggles.
- **Container/presentational split (DL-023)** — `components/` pure; `containers/` connected; `App` reads no state.
- **Addons are editor plugins (DL-006)** — history, saved queries, examples, future file import.
- **Shared but not speculative (DL-008).**
- **Backend owns SQL execution (DL-004):** split (`dbgate-query-splitter`) → classify → run in
  order, stop on first error, return `{ statements }` with columns/rows/timing/errors.
- **Persistence:** `better-sqlite3` behind repositories (DL-013). **Caching:** via TanStack Query
  (schema/history/saved); **run results never cached** (DL-020).
- **Async:** run-query via TanStack `useMutation` (idle/pending/success/error) + `AbortSignal`;
  always show loading/empty/error states (DL-020).
- **Tests (DL-015, pragmatic):** splitter/classifier, repositories, `/query` route, the run
  `useMutation` hook (in `QueryClientProvider`), one UI path. Golden dataset
  (`web/src/data/goldenQueries.ts`) powers the in-UI Examples picker **and** test fixtures (DL-016).

## Commands

- `npm run dev` — Express + Vite (proxies `/query`, `/api/*` → :8080).
- `npm run build` — Vite build → `dist/public`.
- `npm run start` — Express serves the built SPA at `/`.
- `npm test` — Vitest.

## When you make a new pertinent decision

Append a `DL-xxx` entry to `claude/DECISION_LOG.md` (the source of truth) and update the skill /
this file if it changes a rule.

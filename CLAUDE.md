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
- **Read state via selectors** (minimal slices, `useSyncExternalStore`) — never raw `useContext`
  for data. Actions come from a stable handle. Split state by update frequency (DL-010/DL-012).
- **Click UI first (DL-017)** — use `@clickhouse/click-ui` before building a component; build
  custom only when it's missing (e.g. the editor → CodeMirror, DL-002).
- **Addons are editor plugins (DL-006)** — history, saved queries, examples, future file import.
- **Shared but not speculative (DL-008).**
- **Backend owns SQL execution (DL-004):** split (`dbgate-query-splitter`) → classify → run in
  order, stop on first error, return `{ statements }` with columns/rows/timing/errors.
- **Persistence:** `better-sqlite3` behind repositories (DL-013). **Caching:** only schema
  autocomplete metadata; never cache results (DL-014).
- **Async:** `useRunQuery` discriminated-union state machine + `AbortController`; always show
  loading/empty/error states.
- **Tests (DL-015, pragmatic):** splitter/classifier, repositories, `/query` route,
  `useRunQuery`, one UI path. Golden dataset (`web/src/data/goldenQueries.ts`) powers the in-UI
  Examples picker **and** test fixtures (DL-016).

## Commands

- `npm run dev` — Express + Vite (proxies `/query`, `/api/*` → :8080).
- `npm run build` — Vite build → `dist/public`.
- `npm run start` — Express serves the built SPA at `/`.
- `npm test` — Vitest.

## When you make a new pertinent decision

Append a `DL-xxx` entry to `claude/DECISION_LOG.md` (the source of truth) and update the skill /
this file if it changes a rule.

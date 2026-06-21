# ClickHouse SQL Web Editor

A small web-based SQL editor for ClickHouse. Write SQL in a syntax-highlighted editor, run
single- or multi-statement scripts, and see per-statement results — with explicit loading,
error, and cancellation states, plus a dark/light theme. An Express backend executes SQL
against a ClickHouse container and persists query history and saved queries in SQLite.

## Requirements

- Docker and Docker Compose
- Node 20+

## Setup

```bash
docker compose up -d   # starts ClickHouse (HTTP on :8123)
npm i
```

## Running

**Development** (hot-reload backend + frontend):

```bash
npm run dev
```

Runs Express on `:8080` and the Vite dev server concurrently; open the Vite URL it prints
(default http://localhost:5173). Vite proxies `/query` and `/api/*` to Express, so it's
same-origin (no CORS).

**Production-like** (Express serves the built SPA at `/`):

```bash
npm run build      # vite build → dist/public
npm start          # open http://localhost:8080
```

> If `:8080` is already taken (a stale server), free it before `npm start`.

## Testing

```bash
npm test           # runs both projects (Node backend + jsdom frontend)
npm run test:server
npm run test:web
```

## Features

- **CodeMirror editor** — SQL syntax highlighting and line numbers.
- **Run single or multi-statement scripts** — each statement is split, classified, and executed
  in order; results render per statement (a table for data, a "command executed" note for
  DDL/DML, an inline error for a failure). Execution **stops at the first error** and says so.
- **Async UX** — explicit idle / running / error states, run cancellation, large results capped
  server-side.
- **Dark / light theme** — toggled in the toolbar; persisted locally.
- **Last script persistence** — your editor content is restored across reloads.
- **Persistence API** — every run is logged to **history**, and queries can be **saved** for
  reuse, via `/api/history` and `/api/queries` (SQLite). *(Frontend UI for these is planned.)*

See `src/requests.http` for example API calls.

## Architecture

A layered design, documented in detail under [`claude/`](./claude):

- **Backend** (`src/server/`) — Express app factory; `POST /query` (split → classify → execute →
  per-statement `{ statements }`); `/api/history` + `/api/queries` over SQLite repositories;
  serves the built SPA in production.
- **Frontend** (`web/`) — React + Vite. Pure, memoized presentational components built on Click
  UI; connected wrappers in `containers/`; UI state in split React Context + `useReducer`
  providers; server state via TanStack Query.

```
src/server/      Express backend (routes, sql/, db/, clickhouse client)
web/src/         React frontend (components, containers, state, hooks, api)
claude/          Engineering docs (plan, decision log, spike, build/review logs)
.claude/skills/  Engineering playbook loaded by AI agents working in this repo
docker/          ClickHouse container config
```

## Tech stack

Express · `@clickhouse/client` · `dbgate-query-splitter` · `better-sqlite3` · React 18 · Vite ·
TypeScript · `@clickhouse/click-ui` · CodeMirror 6 · TanStack Query · Vitest.

## Engineering conventions

Design decisions are recorded as an ADR-style log in
[`claude/DECISION_LOG.md`](./claude/DECISION_LOG.md); the build plan is in
[`claude/IMPLEMENTATION_PLAN.md`](./claude/IMPLEMENTATION_PLAN.md). The binding conventions live
in [`.claude/skills/sql-editor-engineering/SKILL.md`](./.claude/skills/sql-editor-engineering/SKILL.md)
and are surfaced via `CLAUDE.md`.

---

## The brief (original assignment)

Given the current project, let's implement a small SQL web editor using React. When opening `/`,
the React application should render and display a SQL editor where users can write and execute
SQL queries.

The goal is to demonstrate how you structure a front-end application, handle data flow and
asynchronous interactions.

Please implement the following features:
- Run a query and display the query results in the UI
- Support running multi-statement SQL scripts and display their results
- Bonus: Insert data from a file

### Notes

- We encourage you to make this your own: feel free to add small improvements, extra features, or
  UX enhancements that you think are valuable.
- You may introduce any third-party dependencies you find useful.
- We have our [UI component library](https://click-ui.vercel.app) if you want help with component
  design or faster scaffolding, but you are free to use whatever tools or libraries you prefer.
- You are welcome to use AI-assisted tools (e.g., Claude, Copilot, Cursor, etc.) as part of your
  workflow. If you do, please be prepared to explain your solution and the decisions you made.
- Focus on clarity, code quality, and reasonable structure rather than pixel-perfect styling.

### Evaluation Criteria

We will primarily look at:
- Code organization and overall architecture
- Readability and maintainability
- Component design and state management approach
- Handling of async flows, loading states, and errors
- Basic UX considerations and usability
- Thoughtfulness in trade-offs and decisions
</content>

# Architecture

Backend and frontend architecture diagrams for the SQL Editor. Rationale for every choice is in
[`DECISION_LOG.md`](./DECISION_LOG.md) (referenced inline as `DL-xxx`); the plan is
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). Diagrams use Mermaid (rendered on GitHub).

The split: the **backend owns all SQL execution semantics** (split → classify → execute, persistence,
LLM proxy) behind narrow injectable **ports**; the **frontend is layered** (pure presentation →
containers → hooks → services) with **server state in TanStack Query** and **UI state in React
Context**, and optional features attach as **editor plugins**.

---

## Backend (`src/`)

Express app factory with dependency injection (DIP) — constructable in tests with no socket/network.
Routes depend only on narrow ports (`ClickHouseExecutor`, `SqlGenerator`) and repository interfaces,
so every collaborator is mockable.

```mermaid
flowchart TB
  FE["Browser SPA — same-origin fetch"]

  subgraph Server["Express server (src/)"]
    IDX["index.ts — load .env, build deps, listen :8080"]
    APP["app.ts — createApp(deps)<br/>express.json · SPA static + fallback (prod) · terminal jsonErrorHandler"]

    subgraph Routes["routes/"]
      Q["POST /query"]
      IMP["POST /import (multer)"]
      HIST["/api/history"]
      SAV["/api/queries"]
      AI["POST /api/ai/sql"]
      HLZ["GET /api/health"]
    end

    subgraph SQLlayer["sql/ (DL-003/DL-004)"]
      SPLIT["splitStatements — dbgate-query-splitter"]
      CLS["classify — query vs command"]
    end

    subgraph Ports["Ports — DIP (DL-005)"]
      CHX["ClickHouseExecutor (clickhouse.ts)<br/>query · command · insert"]
      GEN["SqlGenerator (ai/sqlGenerator.ts)<br/>generate — structured output"]
    end

    subgraph Repos["Persistence (DL-013)"]
      HR["historyRepository"]
      SR["savedQueryRepository"]
      DBF["db.ts — better-sqlite3"]
    end
  end

  CH[("ClickHouse :8123")]
  GEM[("Google Gemini API (DL-031/DL-032)")]
  SQLITE[("SQLite — data/app.db")]

  FE -->|HTTP| APP
  IDX --> APP
  APP --> Routes

  Q --> SPLIT --> CLS --> CHX
  Q -.->|auto-log run| HR
  IMP -->|"create-table (DL-033) + insert"| CHX
  AI --> GEN
  HIST --> HR
  SAV --> SR

  HR --> DBF
  SR --> DBF
  DBF --> SQLITE
  CHX -->|"@clickhouse/client"| CH
  GEN -->|"@google/genai"| GEM
```

**Notes**
- `POST /query` (DL-004): split the script, classify each statement, execute in order, **stop on
  first error**, return `200 { statements: StatementResult[] }` (per-statement errors are data); rows
  capped server-side. Every run is best-effort auto-logged to history (DL-013), skippable via
  `recordHistory:false` for internal reads like schema (DL-029).
- `POST /api/ai/sql` (DL-031/DL-032): checks `GEMINI_API_KEY` → **503 if unset** *before* calling the
  generator; otherwise Gemini returns structured `{ sql, explanation? }`. Key is server-only.
- The two ports (`ClickHouseExecutor`, `SqlGenerator`) isolate `@clickhouse/client` / `@google/genai`
  to one file each and let routes be tested with fakes (no DB, no API key).

---

## Frontend (`web/src/`)

Four layers with dependencies pointing inward (DL-005): pure **presentation** → connected
**containers** → **hooks** (business logic) → **services** (framework-agnostic IO) → domain types.
UI state lives in split React Context (DL-019/DL-022); server state lives in TanStack Query (DL-020);
optional features attach as **editor plugins** through a registry (DL-006/DL-026).

```mermaid
flowchart TB
  subgraph Tree["Provider tree (main.tsx)"]
    direction LR
    TP["ThemeProvider"] --> CUI["ClickUIProvider"] --> QCP["QueryClientProvider"] --> EDP["EditorProvider"] --> QP["QueryProvider"] --> APP["App (composition root — reads no state)"]
  end

  subgraph Containers["containers/ — connected wrappers (DL-023)"]
    EPANE["EditorPane"]
    RC["RunControls"]
    RR["ResultsRegion"]
    PRAIL["PluginRail (left/right, DL-026)"]
    PPANEL["PluginPanel"]
    TSW["ThemeSwitcher"]
  end

  subgraph Components["components/ — pure, React.memo, Click UI (DL-017)"]
    ES["EditorSurface — CodeMirror (DL-002)"]
    RT["ResultTable — search/sort (DL-024)"]
    SRC["StatementResultCard · ResultsPanel · StatusBar"]
    BTN["RunButton · ErrorBanner · Toolbar"]
  end

  subgraph Plugins["plugins/ — editor plugins (DL-006)"]
    PLG["examples · history · saved · schema · import · ai"]
  end

  subgraph Hooks["hooks/ — business logic"]
    URQ["useRunQuery — useMutation (DL-020)"]
    UE["useEditorDoc/IsEmpty/Actions (DL-010)"]
    UQ["useHistory · useSavedQueries · useSchema — useQuery"]
    UG["useGenerateSql"]
    UM["useImportFile · useToast · usePlugins"]
  end

  subgraph Services["api/ — framework-agnostic services (DL-005)"]
    AC["apiClient.runQuery"]
    SVC["history · savedQueries · schema · ai · import · formatError"]
    TYP["types — FE↔BE contract mirror"]
  end

  BE["Express backend"]

  APP --> Containers
  Containers --> Components
  Containers --> Plugins
  Components --> Hooks
  Plugins --> Hooks
  Hooks --> Services
  Services -->|"fetch (same-origin; Vite proxy in dev)"| BE
  ES -. "schema autocomplete (DL-025)" .-> UQ
```

**Notes**
- **Presentation is pure** (props only, memoized, Click UI); **containers** consume hooks/providers
  and pass plain props down; `App` reads no state, so it never re-renders (DL-023).
- **State by concern (DL-010/DL-019):** the editor document lives in its own Context split into
  `doc` / `isEmpty` / `actions` so typing never re-renders results; theme in `ThemeProvider`.
- **Server state (DL-020):** run-query is a `useMutation` (never cached); history/saved/schema are
  `useQuery` with `invalidateQueries` on mutation. One cached `useSchema` feeds both the schema
  explorer and CodeMirror autocomplete (DL-025).
- **Plugins (DL-006/DL-026):** each is `{ id, toolbarLabel, icon, title, placement, renderPanel }`;
  the icon `PluginRail` (left = sources, right = inspection, DL-028) toggles a `PluginPanel`. Adding a
  feature = registering a plugin; the editor core is untouched (OCP).
- **Contract:** `web/src/api/types.ts` mirrors the backend `RunResponse`/`StatementResult`; every
  service is a thin typed `fetch` throwing `ApiError` on non-2xx.

---

## Request lifecycle — "run a query"

```mermaid
sequenceDiagram
  participant U as User
  participant Ed as EditorPane / RunControls
  participant H as useRunQuery (useMutation)
  participant A as apiClient
  participant R as POST /query
  participant X as ClickHouseExecutor
  participant CH as ClickHouse

  U->>Ed: click Run
  Ed->>H: run(doc)
  H->>A: runQuery(sql)
  A->>R: POST { query }
  R->>R: split → classify (per statement)
  loop each statement (stop on first error)
    R->>X: query() / command()
    X->>CH: HTTP
    CH-->>X: rows / error
  end
  R-->>A: 200 { statements }
  A-->>H: RunResponse
  H-->>Ed: ResultsRegion renders per-statement cards
```

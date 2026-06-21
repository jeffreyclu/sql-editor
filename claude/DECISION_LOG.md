# Decision Log

A running, append-only record of every pertinent engineering decision for the
ClickHouse SQL Web Editor. Newest decisions go at the bottom. Each entry is
ADR-lite: **Context → Decision → Consequences → Alternatives**.

> Conventions: `Status` is one of `Accepted` / `Superseded by DL-NNN` / `Proposed`.
> Dates are absolute (YYYY-MM-DD).

---

## DL-001 — Use ClickHouse "Click UI" as the component library

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User (product owner)
- **Context:** The assignment links to ClickHouse's own design system, Click UI
  (`@clickhouse/click-ui`, Apache-2.0). Using it signals familiarity with the
  ClickHouse stack and gives us Table, Button, Select, Dialog, Tabs, Accordion,
  Toast, Alert, FileInput, and more out of the box.
- **Decision:** Adopt `@clickhouse/click-ui` as the presentational component
  library. Wrap the app in `<ClickUIProvider>`, which delivers styles via its JS import
  graph — **no manual CSS import** (v0.6.1 exposes no `cui.css` subpath; corrected per FE
  review R1. Theming/tokens: DL-021).
- **Consequences:**
  - Pulls in peer deps: `styled-components@^6`, `dayjs@^1.11`, `react@^18.3`.
  - Click UI ships **no interactive code editor** (its `CodeBlock` is read-only),
    so the SQL editor is a separate decision — see DL-002.
  - Standard primitives (Table, Dialog, Select, Toast) come for free, reducing the
    amount of presentational code we hand-write.
- **Alternatives considered:** Lightweight custom CSS (more control, less on-brand);
  Tailwind (extra build config, not tied to the ClickHouse stack). Rejected in favor
  of the first-party design system.

---

## DL-002 — Buy CodeMirror 6 for the SQL editor

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User, after buy-vs-build spike (see `SPIKE-buy-vs-build.md`)
- **Context:** Click UI has no editor. We need syntax highlighting, line numbers,
  keymaps (Cmd/Ctrl+Enter to run), and ideally schema autocomplete.
- **Decision:** **Buy** CodeMirror 6 via `@uiw/react-codemirror` + `@codemirror/lang-sql`
  (both MIT, actively maintained, ~29 kB gzip for the wrapper).
- **Consequences:**
  - CodeMirror's **extension system maps directly onto our "addons as editor plugins"
    requirement** (see DL-006) — plugins can contribute CM extensions.
  - `@codemirror/lang-sql` has no native ClickHouse dialect; generic SQL highlighting
    works today, and a custom dialect (`SQLDialect.define(...)`) can be added later as
    a small, isolated enhancement.
  - Schema-aware autocomplete is possible by feeding table/column names into `sql({schema})`.
- **Alternatives considered:** Monaco (`@monaco-editor/react`) — ~10x heavier
  (~500 kB gzip), needs Vite web-worker setup, overkill for a focused SQL editor.
  Plain `<textarea>` (build) — zero deps but weakest UX and we'd reimplement plugin
  hooks ourselves.

---

## DL-003 — Buy `dbgate-query-splitter` for multi-statement splitting

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User, after buy-vs-build spike
- **Context:** Multi-statement scripts must be split into individual statements before
  execution. Splitting SQL correctly requires respecting string literals, `--` and
  `/* */` comments, and semicolons inside strings.
- **Decision:** **Buy** `dbgate-query-splitter` (MIT, zero-dependency, maintained) and
  run it on the **backend**.
- **Consequences:**
  - No library certifies the ClickHouse dialect, so we must choose the closest options
    preset (likely MySQL-style options) and **add unit tests covering ClickHouse edge
    cases** (e.g. `''` quote-escaping, backtick identifiers, `--`/`/* */` comments).
  - If preset coverage proves insufficient, we fall back to a custom options object
    (a new decision will be logged).
- **Alternatives considered:** Build a ~80-line hand-rolled tokenizer (more control,
  but reinventing a solved problem); `node-sql-parser` (full AST, ~500 kB, overkill,
  also no ClickHouse dialect).

---

## DL-004 — Split, classify, and execute multi-statement scripts on the backend

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** Engineering
- **Context:** The current `POST /query` runs a single statement and returns only
  `{ rows }` with no column metadata. We need per-statement results with columns,
  types, row counts, and timing.
- **Decision:** Keep all SQL execution semantics on the **backend**:
  1. Split the script (DL-003).
  2. Classify each statement by leading keyword: data-returning
     (`SELECT`/`WITH`/`SHOW`/`DESCRIBE`/`EXPLAIN`/`EXISTS`) → `client.query({ format: 'JSON' })`;
     everything else → `client.command()`.
  3. Execute sequentially, **stop on first error**.
  4. Return HTTP 200 with `{ statements: StatementResult[] }` (per-statement errors are
     data, not transport failures); reserve 4xx/5xx for malformed requests / server faults.
  - Use `format: 'JSON'` (not `JSONEachRow`) to get `meta` (column name+type),
    `rows`, and `statistics.elapsed` for free.
  - Cap returned rows server-side (default 1000) with a `truncated` flag.
- **Consequences:** Frontend stays purely presentational + state; backend owns
  correctness. The single-statement `{ rows }` contract is replaced (only consumer is
  our own SPA).
- **Alternatives considered:** Client-side splitting (leaks execution logic into the UI);
  sending the whole script in one HTTP request (ClickHouse HTTP runs one statement per
  request and we'd lose per-statement results).

---

## DL-005 — Layered frontend architecture (presentation / hooks / context / services) + SOLID

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User (driving principles)
- **Context:** The deliverable is judged on architecture, maintainability, component
  design, and state management. User mandated: separate business logic from pure
  presentational components; hooks for the business-logic layer; Context/providers for
  state; extract business-logic flows into services/providers; follow SOLID; avoid
  over-engineering.
- **Decision:** Four explicit layers:
  1. **Presentation** — pure, `React.memo`'d components (props only, no IO), built on Click UI.
  2. **State** — React Context + providers, split by update frequency (see DL-010).
  3. **Business logic** — custom hooks (`useEditor`, `usePlugins`) + TanStack Query hooks
     (run / history / saved / schema — DL-020).
  4. **Services** — framework-agnostic TS (thin typed fetch fns + domain `types`).
  - SOLID mapping: SRP (each layer one reason to change), OCP (plugins extend without
    modifying core — DL-006), ISP (small interfaces like `EditorPlugin`, `ToolbarAction`),
    DIP (components depend on hook/service abstractions; `apiClient` injected via provider
    for testability).
- **Consequences:** More files/indirection than a single-component app, but each piece is
  small and testable. We deliberately keep abstractions minimal (DL-008) to avoid
  over-engineering.

---

## DL-006 — File upload deferred; addons modeled as editor plugins

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User
- **Context:** File upload (bonus) is wanted eventually, but the priority is a
  maintainable, easily extensible base product into which features slot cleanly. User
  directive: "treat addons (like file upload) as an editor plugin."
- **Decision:** Build a **minimal plugin registry** now; defer the file-upload feature.
  - `EditorPlugin` interface: `{ id, toolbarActions?, commands?, panels?, codeMirrorExtensions? }`.
  - A `PluginProvider` collects plugins; the toolbar renders contributed `toolbarActions`,
    the editor mounts contributed CM extensions, a panel host renders `panels`.
  - Core "Run" stays built-in (avoid over-engineering); plugins are for optional addons.
  - **File upload (future)** = a `fileImportPlugin` contributing an "Import" toolbar button
    + a Click UI Dialog panel, calling `apiClient.importFile` → a future `POST /import`
    (multer) endpoint. Only the seam (registry + interface + example wiring) is built now.
- **Consequences:** New features attach without touching editor core (OCP). Plugin system
  is intentionally lean — no event bus or lifecycle hooks beyond `register`.
- **Alternatives considered:** Bolt file upload directly into the toolbar (fast, but not
  extensible); full plugin framework with lifecycle/events (over-engineered for scope).

---

## DL-007 — Vite + React 18 + TypeScript 5 toolchain; Express serves the built SPA

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** Engineering
- **Context:** Repo is currently backend-only (Express + tsx, TypeScript 4.9, `@types/node@16`,
  tslint). It needs a React build pipeline, and opening `/` must render the React app.
- **Decision:**
  - Add a Vite + React + TS app under `web/`. Single root `package.json`.
  - Scripts: `dev` (concurrently runs Express + Vite, Vite proxies `/query` → :8080),
    `build` (`vite build` → `dist/public`), `start` (`NODE_ENV=production tsx src/index.ts`
    serving the built SPA at `/` with an SPA fallback).
  - **Upgrade `typescript` 4.9 → ^5.4** and **`@types/node` 16 → ^20** (README already
    requires Node 20+); **drop `tslint`** (EOL) — optionally replace with ESLint later.
    Keep `tsx`.
  - Split tsconfigs: backend (`commonjs`) excludes `web/`; `web/tsconfig.json` (JSX,
    `moduleResolution: bundler`); `tsconfig.node.json` for `vite.config.ts`.
  - Same-origin via dev proxy + prod static serving → **no CORS**.
- **Consequences:** One `npm i` / `npm run start` for reviewers. TS upgrade is mandatory
  for modern Vite/React types.
- **Alternatives considered:** Separate `web/package.json` (cleaner dep separation, two
  installs — rejected for reviewer simplicity).

---

## DL-008 — "DRY" intent: reusable, but not speculative

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User (clarified)
- **Context:** The directive "avoid DRY … always create shared components" was ambiguous.
- **Decision:** Build presentational pieces as shared/reusable components, but **do not
  abstract prematurely** — extract a shared abstraction when a real second use appears,
  not speculatively. This reconciles "avoid over-engineering" with "always create shared
  components."
- **Consequences:** Shared component library grows from real usage; we avoid the wrong
  abstraction.

---

## DL-009 — Results grid: Click UI Table + server-side row cap; defer virtualization

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** Engineering
- **Context:** Result sets can be large; a naive table can hang the UI.
- **Decision:** Render results with the **Click UI Table** (DL-001) and **cap rows
  server-side** (default 1000, `truncated` flag + UI notice). Defer dedicated
  virtualization (`react-window` / `@tanstack/react-table`) until needed.
- **Consequences:** Simple, cohesive UI now; clear extension point if large-result UX
  becomes a requirement (would be a new decision).

---

## DL-010 — State in React Context/Providers, split by update frequency + memoization

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User (driving principles) + Engineering
- **Context:** User mandated Context/providers for state and memoization to prevent
  re-renders. A single context updated on every keystroke would re-render the whole tree.
- **Decision:**
  - `EditorProvider` owns the high-frequency editor document + plugin registry.
  - Query execution/results are **server state** owned by TanStack Query (DL-020), not a Context
    store; only editor/UI state lives in providers here.
  - Memoize context values with `useMemo`, stabilize callbacks with `useCallback`, wrap
    presentational components in `React.memo`. Split read/write contexts if profiling
    shows churn.
  - **State is split into one small provider per concern** (DL-019, which superseded the
    DL-012 selector approach) — each read with a plain `useContext` wrapper.
- **Consequences:** Typing in the editor does not re-render the results grid, and vice
  versa.

---

## DL-011 — The six evaluation criteria are the primary design drivers

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User
- **Context:** The work will be judged primarily on: (1) code organization & overall
  architecture, (2) readability & maintainability, (3) component design & state-management
  approach, (4) handling of async flows / loading states / errors, (5) basic UX &
  usability, (6) thoughtfulness in trade-offs and decisions. These must be **rock-solid**.
- **Decision:** Treat the six criteria as the acceptance bar for every layer and PR. The
  Implementation Plan carries an explicit **"Evaluation criteria — how this design satisfies
  each"** table mapping each criterion to concrete mechanisms, and reviews check against it.
- **Consequences:**
  - Architecture (1) and component/state design (3) → enforced by the four-layer split,
    pure memoized components, Context-by-frequency, and the plugin registry (DL-005, DL-010).
  - Async/loading/errors (4) → TanStack Query `useMutation` (idle/pending/success/error) +
    `AbortSignal` + per-statement error reporting (DL-004/DL-020).
  - Readability/maintainability (2) and trade-offs (6) → small single-purpose modules plus
    this decision log and the buy-vs-build spike as durable rationale.
  - UX (5) → CodeMirror affordances, Cmd/Ctrl+Enter, cancel, timing/row counts, truncation notice.
- **Alternatives considered:** Optimize for feature count / pixel-perfect styling — rejected;
  the brief explicitly prioritizes clarity, structure, and reasoning over polish.

---

## DL-012 — Read state via the selector pattern (subscribe to minimal slices)

> ⚠️ **Superseded by DL-019 (2026-06-20).** We dropped the custom selector store in favor of
> plain split React Context + `useState` (barebones). Retained below for history.

- **Date:** 2026-06-19
- **Status:** Superseded by DL-019
- **Decided by:** User
- **Context:** Even with contexts split by update frequency (DL-010), a component that calls
  `useContext` re-renders whenever **any** field of that context value changes — not just the
  slice it reads. To minimize re-renders and make each component's data dependencies explicit,
  state access should be **selector-based**: a component reads only the parts of state needed
  to support its action/render.
- **Decision:** Expose each state domain through a provider-held store and consume it via
  **selector hooks** — e.g. `useQuerySelector(s => s.status)`, `useEditorSelector(s => s.doc)`.
  A component re-renders **only when its selected slice changes** (equality-checked).
  - Subscription primitive: **React 18 `useSyncExternalStore`** (zero-dependency, canonical),
    with the store **created in and provided by the Context provider** — this honors DL-010
    ("state lives in providers") while enabling true selective subscription.
  - Selectors return the **smallest necessary data**. Default equality is `Object.is`; an
    optional custom comparator is supported for selectors that return objects/arrays.
  - **Actions** (`run`, `cancel`, `dispatch`, plugin registration) are read from a separate
    **stable handle**, so reading an action never triggers a re-render.
- **Consequences:**
  - Minimal-subscription re-renders; selectors are pure, unit-testable functions.
  - A component's coupling to state is explicit and narrow (supports SRP/DIP).
  - Slightly more plumbing than raw `useContext`; kept lean to avoid over-engineering.
- **Alternatives considered:**
  - Raw `useContext` — re-renders on any context change (rejected: violates the directive).
  - `use-context-selector` library — pure-context selector API; viable **buy** alternative if
    we prefer less hand-written store code (noted, not chosen by default).
  - Full store lib (Zustand/Redux) — built-in selectors but heavier and runs against the
    "use React Context/providers" directive (DL-010); rejected.

---

## DL-013 — Lightweight persistence: SQLite via `better-sqlite3`, behind repositories

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User (engine choice) + Engineering (design)
- **Context:** We need to persist user queries for re-use (named **saved queries**) and an
  automatic **run-history** log, server-side, using a lightweight DB.
- **Decision:** Use **`better-sqlite3`** (embedded single-file SQLite) accessed through
  **repository interfaces** (`historyRepository`, `savedQueryRepository`) so the engine is
  swappable and unit-testable with an in-memory fake (DIP).
  - Two tables: `query_history` (auto-logged on every run, success or error) and
    `saved_query` (explicit, named, for re-use) — distinct lifecycles.
  - Endpoints: `POST /query` auto-records history; `GET/DELETE /api/history`;
    `GET/POST/PUT/DELETE /api/queries`.
  - Frontend exposes both as **editor plugins** (DL-006); their data is fetched/cached via
    **TanStack Query** (`useQuery` + `invalidateQueries`), DL-020.
- **Consequences:** Real SQL, easy to inspect; native module (ships prebuilt binaries); the
  DB file is added to `.gitignore`. Repository abstraction enables fast in-memory tests (DL-015).
- **Alternatives considered:** `node:sqlite` (experimental, needs Node 22+; repo targets 20+);
  `lowdb` (JSON file, weaker as history grows); reuse ClickHouse (OLAP mismatch + couples app
  state to the query target). All rejected.

---

## DL-014 — Caching strategy: targeted, not general

> ⚠️ **Superseded by DL-020 (2026-06-20).** We adopted TanStack Query as the server-state layer.
> DL-014's *policy* still holds (run results never cached; schema cached; ClickHouse query cache is
> a server toggle) — but the *mechanism* (hand-rolled stores / no library) is replaced. Retained for history.

- **Date:** 2026-06-19
- **Status:** Superseded by DL-020
- **Decided by:** Engineering (answering "do we need caching?")
- **Context:** Asked whether caching is needed/helpful.
- **Decision:** **No general-purpose / result cache.** Cache in exactly one place and reuse
  existing mechanisms elsewhere:
  - **Schema/autocomplete metadata — cache** client-side in a `SchemaProvider` (manual
    "refresh schema" + optional TTL); read often, changes rarely.
  - **Query results — never cached** (freshness/correctness). ClickHouse's own query cache is
    an optional server-side toggle, not an app concern.
  - **History & saved queries — in-memory provider store**, invalidated on mutation; SQLite
    reads are local/fast.
  - **Render caching** via `React.memo` + context-splitting (DL-010/DL-019); **asset caching** via
    Vite content-hashed bundles.
- **Consequences:** Avoids stale-data bugs and over-engineering; the one cache (schema) gives
  a real autocomplete UX/perf win.
- **Alternatives considered:** App-level/Redis result cache (rejected: staleness +
  over-engineering); React Query for server-state (heavier than needed for a single screen).

---

## DL-015 — Testing strategy: pragmatic unit tests of critical systems/services/paths

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User
- **Context:** "It's imperative we unit test the most important systems, services, and user
  paths — but don't spend a ton of time."
- **Decision:** **Vitest** (shared FE/BE) + `@testing-library/react`/`user-event` +
  `supertest`. Cover only the highest-risk/most-valuable targets:
  - `sql/splitStatements` + `sql/classify` (riskiest logic; tested over the golden dataset +
    edge cases).
  - Repositories (in-memory SQLite CRUD).
  - `POST /query` route (single/multi/stop-on-error/history logging; ClickHouse client mocked).
  - The run `useMutation` hook (TanStack, wrapped in `QueryClientProvider`) + `AbortSignal` cancellation.
  - One critical UI path (type → Run → results; load golden example → Run).
- **Consequences:** Meaningful safety net without coverage-chasing. Out of scope: exhaustive
  snapshots, Click UI internals, ClickHouse itself.
- **Alternatives considered:** No tests (rejected: explicit requirement); full coverage
  (rejected: time-boxed).

---

## DL-016 — Golden dataset: one source for UI examples **and** tests

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User
- **Context:** Need a golden dataset of SQL queries to run against the editor, **ideally
  visible in the UI** to demo the editor live.
- **Decision:** A single curated array (`web/src/data/goldenQueries.ts`, importable by backend
  tests) is the **one source of truth**:
  - **In the UI** — an `examplesPlugin` renders them as a selectable "Examples" list (Click UI);
    pick one to load into the editor and Run.
  - **In tests** — the same array feeds the splitter/classifier and `/query` route fixtures (DL-015).
  - Coverage: simple `SELECT`, `system.tables` browse, a self-contained multi-statement script
    (`CREATE/INSERT/SELECT` on a `Memory` table), a deliberately invalid query (error path),
    and a couple of aggregations.
- **Consequences:** The demo data and the test corpus never drift apart.
- **Alternatives considered:** Separate seed file vs. test fixtures (rejected: duplication/drift).

---

## DL-017 — Click UI components first; build custom only when Click UI lacks it

- **Date:** 2026-06-19
- **Status:** Accepted (refines DL-001)
- **Decided by:** User
- **Context:** With Click UI adopted (DL-001), we need a clear default to keep the UI cohesive
  and avoid reinventing primitives.
- **Decision:** **Always reach for an existing Click UI component first.** Only build a custom
  component when Click UI genuinely doesn't provide one — and when we do, wrap it so it matches
  the design system. The canonical exception is the **SQL editor** (Click UI has no editor →
  CodeMirror, DL-002).
- **Consequences:** Consistent, accessible UI with minimal bespoke code; custom components are
  rare and justified. Reviewers can trust the UI layer is mostly first-party.
- **Alternatives considered:** Build-first / mix freely (rejected: inconsistency, wasted effort).
- **Refinement (2026-06-20, from FE review):** For surfaces/layout use Click UI **`Panel`**
  (bordered surface), **`Container`** (flex / padding / gap / overflow), and **`Separator`**. Click UI
  **`Card*`** components are rigid tiles (title/icon/description/badge props, **no children slot**),
  so they are **not** used for the statement result cards — `Panel` is the correct surface. Remaining
  bespoke CSS is limited to the app-shell grid, the truncated-SQL line, and the table column-header
  (no Click UI primitive for those).

---

## DL-018 — Engineering principles enforced via a skill + `CLAUDE.md`

- **Date:** 2026-06-19
- **Status:** Accepted
- **Decided by:** User
- **Context:** Every agent working in this codebase must load these technical decisions and
  principles **before building**. Skills alone are model-invoked and not guaranteed to load.
- **Decision:** Capture the full engineering playbook in a project skill
  (`.claude/skills/sql-editor-engineering/SKILL.md`) and **guarantee surfacing** by referencing
  it from **`CLAUDE.md`** (auto-loaded into every session for every agent), which also carries a
  concise rules block and a "read the skill before building" directive.
  - Note: the **`claude/`** folder (plan, this log, spike) is human documentation; the
    **`.claude/skills/`** folder is the machine-loaded skill. They are kept consistent.
- **Consequences:** Strong practical guarantee without fragile hooks. The skill + `CLAUDE.md`
  must be updated whenever a new decision is logged here (this file remains the source of truth).
- **Alternatives considered:** Skill only (no load guarantee); add a SessionStart/PreToolUse
  hook (hardest guarantee, more moving parts — deferred, can add later).

---

## DL-019 — State via plain split React Context + `useState` (barebones)

- **Date:** 2026-06-20
- **Status:** Accepted (**supersedes DL-012**)
- **Decided by:** User
- **Context:** Reviewing frontend Slice 1 surfaced that the custom `createStore` + `useStore`
  selector hook reimplements React's official `useSyncExternalStoreWithSelector` — ~70 lines of
  infra we'd own for a correctness-sensitive job. The user asked for the **absolute simplest,
  barebones** solution and questioned why a custom store exists at all.
- **Decision:** Drop the custom selector store **and** the selector pattern. Store state in
  **plain React Context + `useState`/`useReducer`**, with **one small provider per concern**
  (editor, query, history, saved, schema). **No custom store, no selector library, no dependency.**
  - **Re-render isolation comes from splitting contexts by concern (DL-010)**, not selectors —
    e.g. the editor document lives in its own `EditorContext`, so typing cannot re-render the
    results pane. That's the only re-render problem at this app's scale, and context-splitting
    already solves it.
  - Memoize each provider's context `value` with `useMemo`; keep presentational components
    `React.memo` (DL-005).
  - Add selectors / `useShallow` / a store library **only if** a specific context later shows
    *measured* re-render problems — never speculatively (DL-008).
- **Consequences:**
  - Deletes `web/src/state/createStore.ts`, `web/src/hooks/useStore.ts`,
    `web/src/hooks/useEditorSelector.ts` and their tests. `EditorProvider` becomes Context +
    `useState` (still trivially testable through its hook). The provider tree in `main.tsx` is
    unchanged in shape.
  - Coarser re-renders *within* a single context — negligible here, and aligned with the
    "avoid over-engineering" principle.
  - **Documented scale-up path** if we ever outgrow it: **Zustand** is the industry-standard
    lightweight selector store; Redux Toolkit for heavyweight needs.
- **Alternatives considered:**
  - Keep the custom store (rejected: reinvents an official utility; ~70 LOC + correctness burden).
  - Official `use-sync-external-store/with-selector` shim (rejected: still selector machinery we
    don't need yet).
  - **Zustand** via context / `use-context-selector` (rejected *for now*: a dependency, and more
    than "barebones" requires — kept as the documented scale-up path, not the default).

---

## DL-020 — TanStack Query as the server-state / data-fetching layer (supersedes DL-014)

- **Date:** 2026-06-20
- **Status:** Accepted (**supersedes DL-014**; refines the data-fetch parts of DL-004/005/010/013/015)
- **Decided by:** User
- **Context:** Reviewing the *planned* custom `apiClient` + `useRunQuery` + hand-rolled
  history/saved/schema caches, the user asked why we'd build a custom data layer instead of using
  TanStack Query. The app has two kinds of server interaction: an imperative, **uncached** run-query
  POST, and **cacheable** GETs (history, saved queries, schema). (Nothing custom was built yet —
  `web/src/api/` had only `types.ts` — so this is a zero-refactor choice.)
- **Decision:** Adopt **`@tanstack/react-query`** as the entire **server-state** layer. Client/UI
  state stays plain Context + `useState` (DL-019) — orthogonal: *server* state vs *UI* state.
  - **Run query → `useMutation`.** Imperative, **never cached** (results must be fresh — preserves
    DL-014's policy); pass `AbortSignal` for cancellation. Replaces the planned custom `useRunQuery`
    state machine (`useMutation` already exposes idle/pending/success/error).
  - **History / saved queries / schema → `useQuery`** keyed per resource; **mutations call
    `invalidateQueries`** to refresh. Replaces the hand-rolled in-memory stores + manual
    invalidation (DL-013) and the manual schema cache (DL-014). Schema uses a long `staleTime` +
    manual refetch ("refresh schema").
  - Only custom data code is **thin typed fetch fns** under `api/` (returning the
    `web/src/api/types.ts` shapes); TanStack wraps them. `QueryClientProvider` joins the provider
    tree in `main.tsx`.
- **Consequences:**
  - Deletes the planned custom `apiClient` state plumbing + `useRunQuery`; adds
    `@tanstack/react-query` (~13 kB gz — marginal next to Click UI + CodeMirror).
  - Loading/error/abort, dedup, and cache-invalidation come from the industry-standard server-state
    lib, shrinking custom surface and bug risk.
  - **Eval criterion #4 (async/loading/errors)** is demonstrated via correct TanStack usage
    (mutation states, `AbortSignal`, query invalidation) rather than a hand-rolled machine.
  - Tests wrap hooks in a `QueryClientProvider`; the run path is a `useMutation` test (DL-015).
- **Alternatives considered:** Hybrid (TanStack for GETs, custom `useRunQuery` for run, to showcase
  async handling directly) — viable, **rejected by the user** in favor of one consistent data layer;
  keep-custom / no dependency (rejected: reinvents fetch + cache + invalidate).

---

## DL-021 — Theming: dark/light switcher + Click UI design tokens

- **Date:** 2026-06-20
- **Status:** Accepted (resolves the hardcoded-hex NOTE from R1/R2)
- **Decided by:** User
- **Context:** The app shell used hardcoded hex colors and there was no theme toggle; the user
  wanted dark/light support and styling consistent with the Click UI design system.
- **Decision:** A `ThemeProvider` owns `light|dark` (reducer + own `localStorage`) and feeds
  `ClickUIProvider`'s `theme` prop with **`persistTheme={false}`** (we own persistence). A
  `ThemeSwitcher` (Click UI `Button`) in the toolbar toggles it. Shell CSS uses **Click UI design
  tokens** (`var(--click-global-color-*)`) instead of hex, so the custom shell re-themes
  automatically via the root `data-cui-theme` attribute set by `ClickUIProvider`. `ThemeProvider`
  is outermost in the provider tree.
- **Consequences:** One switch re-themes both Click UI components and the custom shell; no hardcoded
  colors remain (only layout). **Confirmed in-browser by the product owner (2026-06-20).**
- **Alternatives considered:** Click UI's built-in theme persistence (rejected: we persist to our
  own key); CSS-only media-query dark mode (rejected: no user control, wouldn't drive Click UI).

---

## DL-022 — Provider state uses `useReducer` + action creators (refines DL-019)

- **Date:** 2026-06-20
- **Status:** Accepted (refines DL-019)
- **Decided by:** User
- **Context:** DL-019 allows plain `useState`/`useReducer`. The user prefers reducers + semantic
  action creators over ad-hoc `useState` setters, for explicit and testable transitions.
- **Decision:** UI-state Context providers model state with **`useReducer`** + an action union +
  semantic action creators (`setDoc`, `toggleTheme`). Reducers stay **pure**; side effects (e.g.
  `localStorage` persistence) live in `useEffect`. The context `value` is `useMemo`'d.
  (Run-query state remains a TanStack `useMutation` — DL-020; this applies to UI-state providers.)
- **Consequences:** Explicit, unit-testable transitions and a consistent provider shape. Still no
  custom store / selector library (DL-019).

---

## DL-023 — Container / presentational split via a `containers/` layer (refines DL-005)

- **Date:** 2026-06-20
- **Status:** Accepted (refines DL-005)
- **Decided by:** User
- **Context:** `App.tsx` had accumulated connected-wrapper logic; the user asked to split it.
- **Decision:** Three UI tiers:
  - **`components/`** — pure, `React.memo`, props-only, Click UI-based. No hooks/state.
  - **`containers/`** — connected wrappers that consume hooks/providers and pass plain props down
    (`EditorPane`, `RunControls`, `ResultsRegion`, `ThemeSwitcher`).
  - **`App.tsx`** — composition root; reads **no** state, so it never re-renders.
  Each container subscribes to **only its** provider, so re-renders stay isolated (DL-010) — e.g.
  `ResultsRegion` reads only the query provider, so typing never re-renders results.
- **Consequences:** Presentation stays logic-free/testable; subscription boundaries are explicit;
  `App` never re-renders. Clear home for the future plugin-contributed wrappers.

---

## DL-024 — Feature scope vs. ClickHouse SQL Console (gap analysis)

- **Date:** 2026-06-20
- **Status:** Accepted
- **Decided by:** User
- **Context:** Benchmarked against ClickHouse Cloud's SQL Console
  ([docs](https://clickhouse.com/docs/integrations/sql-clients/sql-console)) to find gaps. That's a
  mature product; most of its surface is out of scope for this exercise, but a few gaps are cheap
  and high-value.
- **Decision:** Adopt a prioritized subset as scoped follow-ups — each an **editor plugin /
  toolbar action** (DL-006) where it fits — and explicitly defer the rest:
  - **Will add (high-value, low-cost):** export results as **CSV**; **schema browser sidebar**
    (databases → tables → columns over `system.tables`/`system.columns`, feeding autocomplete);
    **run selection** (Cmd/Ctrl+Enter on a selection) + **run at cursor** (Cmd/Ctrl+Shift+Enter) +
    **Esc to cancel**; **result-set search**; **client-side column sort**; saved-query polish
    (Cmd/Ctrl+S + inline rename) alongside the Slice-3 saved-queries UI.
  - **Already on the roadmap (Slice 3):** history UI, saved-queries UI, examples (golden dataset),
    schema autocomplete, file-import plugin.
  - **Deliberately deferred / out of scope (trade-off, not omission):** charts/visualizations;
    GenAI NL→SQL & "Fix Query" (separate AI integration); multiple query tabs (structural, low
    marginal value here); sharing/collaboration (needs auth/multi-user); server-side pagination
    (we cap results at 1000 instead — DL-009); filter→SQL builder.
- **Consequences:** Closes the most visible UX gaps cheaply while keeping scope honest; the
  deferred list makes the trade-offs explicit for reviewers (eval criterion #6).

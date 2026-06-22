# Technical Decisions — summary table

Every pertinent technical decision, why it was made, and its trade-offs, grouped by category and
ordered by priority: **performance & optimization first, then tech selections, then everything
else.** Full ADR-style detail for each `DL-xxx` is in [`DECISION_LOG.md`](./DECISION_LOG.md);
diagrams are in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

**Layer key:** FE = frontend · BE = backend · Infra = build/tooling/deploy · Arch = cross-cutting
architecture · UX · Process. *(superseded)* = kept for history, no longer in force.

---

## 1. Performance & optimization

| DL | Decision | Layer | Why | Trade-offs |
|----|----------|-------|-----|------------|
| **009** | **Server-side row cap** (default 1000) + `truncated` flag; cap pushed into ClickHouse via `max_result_rows` + `result_overflow_mode: 'break'` | BE→FE | Arbitrary user SQL can return millions of rows; bound server memory, payload size, and DOM nodes — and stop ClickHouse *reading* early, not just slice after | Truncated views; client sort/search act on shown rows only; cap is block-granular (~one `max_block_size`), not an exact 1000 |
| **010** | **Split React Context by update frequency** + `React.memo`/`useMemo`/`useCallback`; editor doc split into `doc`/`isEmpty`/`actions`; `getDoc` is a ref so the CodeMirror keymap never rebuilds per keystroke | FE | Typing must never re-render the results grid (or vice-versa); keep re-renders minimal without a state library | More providers/contexts and indirection than a single store |
| **019** | **Re-render isolation via context-splitting, not selectors** — plain Context + `useState`/`useReducer`, no custom store | FE | Barebones; splitting by concern already gives the only isolation this app needs | Coarser re-renders *within* one context (negligible at this scale); Zustand is the documented scale-up | 
| **023** | **Container / presentational split**; `App` reads no state | FE | Each container subscribes to only its provider, so subscriptions are isolated and `App` never re-renders; pure components are cheap + testable | More files |
| **020** | **TanStack Query** caches server reads (history/saved/schema) + `invalidateQueries` on mutation; **run-query is an uncached mutation** | FE | Dedupe/cache cacheable GETs; never serve stale query *results* | Adds a dependency + a cache mental model |
| **025** | **One cached `useSchema`** (`system.columns`, 5-min `staleTime`) feeds **both** the schema explorer **and** CodeMirror autocomplete | FE | Read the schema once instead of per-feature/per-keystroke; schema changes rarely | Stale until refetch/invalidation |
| **035** | **Invalidate the schema cache after schema-changing DDL** (CREATE/DROP/ALTER) runs | FE | Autocomplete + explorer stay correct after DDL without a manual refresh | A small classify/heuristic on the run; possible over/under-invalidation |
| **029** | **`/query` `recordHistory: false`** for internal reads (schema fetch) | BE→FE | Schema reads on app load shouldn't pollute the History panel or write needless rows | One extra flag on the `/query` contract |
| **006†** | **Import streams the upload** (single-chunk byte stream) with a **50 MB memory cap** | BE | Bound memory on file import; don't buffer unbounded uploads | Whole-file in memory up to the cap (no true disk streaming yet) |
| 012 | Selector-subscription store over `useSyncExternalStore` *(superseded by 019)* | FE | Minimal-slice re-renders | Reinvented an official utility; removed for being non-barebones |
| 014 | Targeted caching only (schema cached, results never) *(superseded by 020)* | FE | Avoid stale-data bugs + over-engineering | Hand-rolled; replaced by TanStack Query |

†DL-006 is primarily an architecture decision (plugins); the streaming/memory cap is its perf facet.

---

## 2. Tech selections (buy-vs-build & libraries)

| DL | Decision | Layer | Why | Trade-offs |
|----|----------|-------|-----|------------|
| **002** | **Buy CodeMirror 6** (`@uiw/react-codemirror` + `@codemirror/lang-sql`) for the editor | FE | Highlighting, line numbers, keymaps, schema autocomplete; its extension system *is* our plugin seam; ~29 kB | No native ClickHouse dialect (generic SQL highlighting) |
| **003** | **Buy `dbgate-query-splitter`** for multi-statement splitting (backend) | BE | Correctly respects string literals, `--`/`/* */` comments, `;` in strings; zero-dependency | No certified ClickHouse dialect → covered by edge-case unit tests |
| **013** | **better-sqlite3** for persistence, behind **repository interfaces** | BE | Embedded, real SQL, fast, synchronous; swappable + mockable (DIP) | Native module; on-disk file (not serverless-friendly) |
| **020** | **TanStack Query** as the server-state layer | FE | Industry-standard cache/dedupe/invalidate; `useMutation`/`useQuery` | A dependency vs hand-rolled fetch |
| **019** | **Plain React Context over Redux/Zustand** for UI state | FE | "Barebones" directive; no dependency; sufficient here | Manual wiring; Zustand noted as the scale-up path |
| **001** | **Click UI** (`@clickhouse/click-ui`) as the component library | FE | First-party ClickHouse design system; Table/Button/Select/Dialog/Toast free; on-brand | Peer deps (`styled-components`, `dayjs`); `<ClickUIProvider>` required; ships **no editor** |
| **007** | **Vite + React 18 + TypeScript 5**; Express serves the built SPA at `/` | Infra | Fast dev; Vite proxy ⇒ same-origin (no CORS); one server in prod | TS 4.9→5 + `@types/node` upgrade; tsconfig split; dropped tslint |
| **015** | **Vitest + supertest + Testing Library** (pragmatic tests) | Infra | One runner across FE/BE; fast; cover highest-risk paths only | Deliberately not exhaustive coverage |
| **031/032** | **AI = Google Gemini free tier** (`@google/genai`, `gemini-2.5-flash`) behind a `SqlGenerator` port — started on Anthropic/Claude (031), switched for a free key (032) | BE | NL→SQL with native structured output; $0 key; provider swappable behind the port | Off the Claude path; free-tier rate limits; structured-output shape is provider-specific |
| **016** | **Golden dataset** — one shared SQL fixture file for the UI Examples picker **and** tests | FE+BE | Demo data and the test corpus never drift | Must be committed atomically as a contract file |

---

## 3. Architecture & patterns

| DL | Decision | Layer | Why | Trade-offs |
|----|----------|-------|-----|------------|
| **004** | **Split → classify → execute on the backend**; `200 { statements[] }` (per-statement errors are data), stop-on-first-error, `format: 'JSON'` | BE | Backend owns SQL correctness; FE stays purely presentational; columns/types/timing for free | Replaces the old `{ rows }`; one ClickHouse HTTP request per statement |
| **005** | **Layered FE** (presentation → state → hooks → services) + SOLID | FE/Arch | Maintainability, testability, clear seams | More files/indirection than a one-component app |
| **006** | **Plugin registry** — optional features (history, saved, schema, import, AI) attach as editor plugins (OCP) | FE/Arch | Add features without touching editor core | A (deliberately minimal) seam to maintain |
| **017** | **Click UI components first** — custom only when missing; surfaces = `Panel`/`Container`/`Separator` (`Card*` has no children slot) | FE | Cohesive, accessible UI; minimal bespoke code | Occasional gymnastics around Click UI's API limits |
| **022** | Provider state via **`useReducer` + action creators** (refines 019) | FE | Explicit, testable transitions; consistent provider shape | Slightly more boilerplate than `useState` |
| **026** | Plugin toolbar = **icon activity-rail** + a `placement: 'left'\|'right'` seam | FE | Scales as plugins grow; future-proofs a right panel; icon+tooltip+aria | Needs aria wiring; small indirection |
| **028** | **Build the right panel**; schema explorer is right-placed (activates the 026 seam) | FE | A left "source" + right detail can show at once (IDE-like) | Independent left/right open-state to manage |

---

## 4. UX & features

| DL | Decision | Layer | Why | Trade-offs |
|----|----------|-------|-----|------------|
| **021** | **Dark/light theming** via `ThemeProvider` + Click UI design tokens (no hardcoded hex) | FE/UX | Themed, on-brand UI that re-themes automatically | Coupled to Click UI token names |
| **027** | **Toasts** for discrete action confirmations (save/copy/clear/import) | FE/UX | Transient, discoverable feedback; not for query results | Depends on Click UI toast internals |
| **034** | **Readable errors** (`formatClickHouseError`) + **colour-coded toasts** | FE/UX | ClickHouse echoes multi-KB SQL/version noise; tint toasts by type | Marker-based trimming heuristic; class-name coupling (+ the opaque-toast composite fix) |
| **030** | **File-import plugin UX** — schema-backed table picker, format derived from extension, lifecycle-correct upload | FE/UX | Discoverable targets, fewer manual steps, clean success/failure states | Derived format is a default only (can't detect headers) |
| **033** | **Import can create the target table** (`Nullable(String)` columns from the header) | BE | Import into a fresh table without hand-writing DDL first | All-String columns (deterministic MVP); table name validated before DDL |
| **024** | **Scope vs ClickHouse SQL Console** — adopt high-value gaps (CSV export, schema explorer, search/sort, rename), explicitly defer the rest | Process | Close the visible UX gaps cheaply; keep trade-offs honest | Documented deferrals: charts, multi-tab, sharing, server-side pagination, virtualization, deploy |

---

## 5. Process / governance

| DL | Decision | Layer | Why | Trade-offs |
|----|----------|-------|-----|------------|
| **011** | The **six evaluation criteria** are the primary design drivers | Process | Every layer optimizes for architecture, readability, state mgmt, async/error handling, UX, trade-offs | — |
| **008** | **Reusable but not speculative** (the "DRY" intent) | Process | Extract a shared abstraction on the second real use, not before | Some short-term duplication tolerated |
| **018** | Engineering principles enforced via a **skill + `CLAUDE.md`** | Process | Every agent loads the contract before building | Docs must be kept in lockstep with decisions |

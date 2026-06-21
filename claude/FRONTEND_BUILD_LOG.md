# Frontend Build Log

A chronological, append-only record of frontend work on the ClickHouse SQL Web Editor.
One entry per reviewable slice. Newest entries at the bottom. References to `DL-xxx`
point at `DECISION_LOG.md`; the overall plan is `IMPLEMENTATION_PLAN.md`.

> Scope note: this log covers the frontend track only (`web/**` plus frontend-owned
> tooling: `vite.config.ts`, `web/vitest.config.ts`, `web/tsconfig.json`,
> `tsconfig.node.json`, and frontend deps). Backend work under `src/server/**` is tracked
> separately in `BACKEND_BUILD_LOG.md`.

---

## Slice 1 — Frontend foundation + editor surface

- **Date:** 2026-06-19
- **Status:** Complete, awaiting review. Tests green (7 passed); typecheck clean; prod build OK.
- **Plan phase:** 1 (Tooling/serving) + the editor portions of phases 4–5 (state core +
  editor surface). Run → results (the rest of 4–5) is **deliberately deferred** to Slice 2.

### What was built

The architectural foundation and a working editor: open the app and you get a syntax-
highlighted SQL editor backed by the real state architecture. No query execution yet — that
needs the backend's `{ statements }` contract and is the next slice.

| File | Responsibility |
|---|---|
| `vite.config.ts` | Vite build/dev (DL-007): `root: 'web'`, prod build → `dist/public`, dev proxy `/query` + `/api` → `:8080` (same-origin, no CORS). |
| `web/tsconfig.json`, `tsconfig.node.json` | Frontend half of the tsconfig split (DL-007): `moduleResolution: bundler`, `jsx: react-jsx`, `noEmit`. Root `tsconfig.json` (backend) left untouched. |
| `web/index.html`, `web/src/vite-env.d.ts` | SPA entry. |
| `web/src/api/types.ts` | Domain contract the UI renders against — `ColumnMeta`, `StatementResult`, `RunResponse`, `RunRequest`. Mirrors the backend `/query` shape (DL-004). |
| `web/src/state/createStore.ts` | Tiny pub/sub store on the `useSyncExternalStore` contract; shallow-merge `setState` that skips no-op notifies (DL-010/DL-012). The architectural keystone. |
| `web/src/hooks/useStore.ts` | Selector subscription hook: memoizes the selected slice so a component re-renders only when *its* slice changes, even if other state moves (DL-012). Zero-dep equivalent of `useSyncExternalStoreWithSelector`. |
| `web/src/state/EditorProvider.tsx` | High-frequency editor-document store, split from (future) results state so typing never re-renders results (DL-010). Stable `actions` handle (`setDoc`) + best-effort `localStorage` last-script persistence. |
| `web/src/hooks/useEditorSelector.ts` | `useEditorSelector(s => s.doc)` — minimal-slice read over the editor store. |
| `web/src/components/EditorSurface.tsx` | Pure, `React.memo` CodeMirror 6 surface via `@uiw/react-codemirror` + `@codemirror/lang-sql` (DL-002). Props-only; accepts plugin-contributed CM `extensions` (the low-level plugin seam, DL-006). |
| `web/src/components/Toolbar.tsx` | Pure header; `actions` slot so Run/Cancel + plugin toolbar actions inject later without touching it (DL-006/DL-017). |
| `web/src/App.tsx` | Composition root: connects the editor store to the pure `EditorSurface` (wiring lives here, not in `components/`, so presentational components stay logic-free). |
| `web/src/main.tsx` | Provider tree: `ClickUIProvider` (DL-001) → `EditorProvider`. Query/History/SavedQueries/Schema providers slot in here in later slices. |
| `web/src/styles.css` | App-shell layout (toolbar + editor/results panes). Custom CSS — Click UI ships no shell/layout primitive (justified DL-017 exception). |
| `web/vitest.config.ts`, `web/src/test/setup.ts` | Frontend-scoped jsdom test config + `@testing-library/jest-dom` setup. |
| `web/src/state/createStore.test.ts` | Store semantics: initial state, shallow merge, updater fn, notify-on-change, no-notify-on-noop, unsubscribe. |
| `web/src/hooks/useEditorSelector.test.tsx` | Selector reads the slice and reflects action-driven updates (RTL `renderHook`). |

### Architecture honored

- **Four layers, deps inward** (DL-005): presentation (`components/`, pure + memoized) →
  state (`state/` providers) → hooks (`hooks/`) → services/types (`api/types.ts`).
- **Selector reads, not raw `useContext`** (DL-012): components subscribe to minimal slices;
  actions come from a separate stable handle so reading them never re-renders.
- **Split by update frequency** (DL-010): editor document isolated in its own store, ready for
  a separate `QueryProvider` so keystrokes and results never cross-render.
- **Click UI first** (DL-001/DL-017): the only bespoke UI is the editor (CodeMirror, the
  sanctioned exception) and the app shell (no Click UI primitive for it).

### Key decisions / trade-offs

- **Hand-rolled `useSyncExternalStore` store over Redux/Zustand** (DL-010/DL-012) — the
  directive is "state in React Context/providers"; ~40 lines gives true selective subscription
  with no dependency.
- **Click UI styling needs no manual CSS import** — see the DL-001 correction below; verified
  by the 277 kB CSS in the production bundle.
- **App shell is custom CSS**, but verified Click UI primitives (Button/Table/Alert/Dialog)
  are deferred to the run→results slice where they're actually needed — avoids guessing their
  APIs now and keeps this slice's Click UI surface to the one documented provider.
- **Stopped before run→results on purpose** — building the async/results layer against a
  not-yet-finalized backend contract would be throwaway. The contract (`api/types.ts`) is in
  place so the next slice drops straight in.

### Tooling changes (frontend-owned)

- Added deps: `react`, `react-dom`, `@clickhouse/click-ui`, `styled-components`, `dayjs`,
  `@uiw/react-codemirror`, `@codemirror/lang-sql`, `@codemirror/state`. Dev: `vite`,
  `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `jsdom`,
  `@testing-library/{react,user-event,jest-dom}`.
- `package.json` scripts added (additive, non-colliding keys): `build` → `vite build`,
  `dev:web` → `vite`, `test:web` → `vitest run --config web/vitest.config.ts`. Did **not**
  touch `start`/`test`/`test:watch` (backend-owned).

### Verification

- `npm run test:web` → **7 passed** across 2 files (~390ms).
- `tsc -p web/tsconfig.json --noEmit` → **type-clean**.
- `npm run build` → **2540 modules transformed**, `dist/public` emitted (CSS 277 kB / 27 kB
  gzip — confirms Click UI styles bundle via the JS import graph; JS 1.53 MB / 451 kB gzip).

### Open items / coordination

- **Click UI CSS — DL-001 is stale.** It prescribes `import '@clickhouse/click-ui/cui.css'`,
  but installed Click UI is **v0.6.1**, whose `exports` map exposes no CSS subpath. Styling is
  delivered through the JS import graph (`ClickUIProvider` → `ThemeProvider` imports the token
  CSS; components import colocated CSS), so **no manual CSS import is needed** — the guessed
  import is actively wrong (would break the Vite build). Recommend a DL update; not edited yet
  to avoid clashing with the backend agent in the shared decision log.
- **Test discovery is cleanly partitioned** (resolved): backend root `vitest.config.ts`
  (node, `src/**`) runs via `test`/`test:watch`; frontend `web/vitest.config.ts` (jsdom,
  `web/**`) runs via `test:web`. A unified `npm test` that runs both as a root Vitest
  *workspace* is a nice-to-have, deferred to avoid owning a shared root config mid-parallel-work.
- **`dev` (concurrent server + vite) and prod SPA serving** are not wired yet. `dist/public`
  now exists after a build, so the backend can add `express.static` + SPA fallback at `GET /`
  (backend owns `src/`). I added `dev:web` only; a combined `dev` (concurrently) is a small
  joint step.
- **Bundle size** — the build warns the JS chunk is >500 kB (CodeMirror + Click UI + React in
  one chunk). Code-splitting (dynamic import / `manualChunks`) is a deferred optimization, not
  a slice blocker.

### Next slice

**Slice 2 — Run → per-statement results (async core).** `api/apiClient.ts` (typed fetch +
`AbortSignal`), `services/queryService.ts`, `hooks/useRunQuery.ts` (`idle|running|done|error`
discriminated union + `AbortController`, DL-004), `state/QueryProvider.tsx` + `useQuerySelector`
(its own store per DL-010), and pure results components — `ResultsPanel`,
`StatementResultCard`, `ResultTable`, `ErrorBanner`, `StatusBar` — on **verified** Click UI
primitives (Table/Alert). Plus `RunButton`. Consumes the
backend `POST /query` `{ statements }` contract (built in backend Slice 1). Tests: `useRunQuery`
state machine + one critical UI path (type → Run → results).

---

## Slice 2 — Run → per-statement results (async core)

- **Date:** 2026-06-19
- **Status:** Complete, awaiting review. Tests green (13 passed across 4 files); typecheck clean;
  prod build OK.
- **Plan phase:** 4–5 (state + services + hooks; results UI). The editor existed from Slice 1;
  this adds execution and the results surface. Persistence/plugins/autocomplete still deferred.

### What was built

Type a script → Run (button) → see per-statement results, with explicit
loading/empty/error states and cancellation.

| File | Responsibility |
|---|---|
| `web/src/api/apiClient.ts` | Service layer (DL-005): typed `fetch` over `POST /query` with `AbortSignal`. `ApiError` distinguishes transport/4xx/5xx faults from per-statement SQL errors (which are 200 data, DL-004). `ApiClient` interface for injection (DIP). |
| `web/src/hooks/useRunQuery.ts` | The async state machine (DL-004): discriminated union `idle\|running\|done\|error` over a `createStore`, with an `AbortController`. A new run supersedes the in-flight one (aborts + ignores its result); `cancel` returns to idle. |
| `web/src/state/QueryProvider.tsx` | Query-execution store + stable `run`/`cancel` actions; **injectable `apiClient`** (DIP/testability). Separate provider from the editor so the two never share a render path (DL-010). |
| `web/src/hooks/useQuerySelector.ts` | Minimal-slice reads of run state (DL-012). |
| `web/src/components/RunButton.tsx` | Pure Run/Cancel control (Click UI `Button`); flips to Cancel while running. |
| `web/src/components/ResultTable.tsx` | Pure results grid over Click UI `Table`; formats `null`/object cells; server caps rows (DL-009). |
| `web/src/components/ErrorBanner.tsx` | Pure Click UI `Alert` (danger) for transport + per-statement errors. |
| `web/src/components/StatementResultCard.tsx` | Pure per-statement panel: header (index, SQL, rows/timing) over table / "command executed" note / error banner. |
| `web/src/components/ResultsPanel.tsx` | Pure pane rendering **all four** async states explicitly; flags stop-on-first-error (DL-004). |
| `web/src/components/StatusBar.tsx` | Pure run-summary line (Ready / Running… / N statements · ok/failed). |
| `web/src/App.tsx` | Connected wrappers `RunControls` / `EditorPane` / `ResultsRegion`, each subscribing to its own slice. |
| `web/src/main.tsx` | `QueryProvider` added to the tree (Click UI → Editor → Query). |
| `web/src/styles.css` | Results / status-bar / statement-card / column-header styles. |
| `web/src/hooks/useRunQuery.test.tsx` | State machine: idle→running→done, transport error, cancel/abort, supersede-in-flight. |
| `web/src/components/runFlow.test.tsx` | Run → results UI path (mock client): table renders; transport error → banner. |

### Behavior

- **Run** reads the editor document and `POST`s to `/query`; each statement renders in order —
  table for `query`, an "executed" note for `command`, an inline `Alert` for a failed statement.
- **Transport failures** (`ApiError`, 4xx/5xx/network) → a single top-level error banner;
  **per-statement SQL errors** → inline on that statement's card. Stop-on-first-error → a warning
  note that later statements weren't run (derived from "last returned statement is an error").
- **Cancel / supersede** via `AbortController`: a new run aborts the previous and ignores its
  late result; Cancel returns to idle. Run is disabled on an empty document.

### Key decisions / trade-offs

- **No `services/queryService.ts`** — `apiClient` *is* the service; an extra layer would be a
  passthrough here (DL-008, shared-but-not-speculative). Will add one only if real orchestration
  appears.
- **Connected wrappers live in `App`, not `components/`** — presentational components stay pure;
  each wrapper isolates its own subscription so typing never re-renders results and results
  changes never re-render the editor (DL-010/DL-012). `App` reads no state, so it never re-renders.
- **Cell formatting** in `ResultTable`: `null`/`undefined` → `∅`, objects → JSON, else `String`.
  Virtualization still deferred (DL-009).

### Tooling changes (frontend-owned)

- `web/vitest.config.ts`: added `server.deps.inline: [/@clickhouse\/click-ui/]` so Vite (not
  Node) transforms Click UI's internal `.css` imports under Vitest — otherwise jsdom tests that
  mount Click UI components fail with "Unknown file extension .css".
- No new runtime dependencies.

### Verification

- `npm run test:web` → **13 passed** across 4 files (~2 s).
- `tsc -p web/tsconfig.json --noEmit` → **type-clean**.
- `npm run build` → **2550 modules**, `dist/public` emitted (CSS 290 kB / 29 kB gzip; JS
  1.57 MB / 462 kB gzip).

### Open items / coordination

- **Not yet clicked through live** against real ClickHouse (needs `docker compose up` + the
  backend running + a combined `dev`/static-serving step the backend owns). The contract is
  verified against `src/server/types.ts` and `routes/query.ts` — identical shapes, `{ error }` on
  4xx/5xx, `{ statements }` on 200 — so integration should be drop-in.
- **Bundle-size warning** persists (CodeMirror + Click UI + React in one chunk) — deferred
  code-splitting, not a blocker.

### Next slice

**Slice 3 — Persistence + examples as editor plugins (DL-006/DL-013/DL-016).** The plugin
registry/types seam, `HistoryProvider` + `SavedQueriesProvider` over `/api/history` +
`/api/queries` (backend Slice 2), `historyPlugin` + `saveQueryPlugin` + `examplesPlugin`, and the
golden dataset (`web/src/data/goldenQueries.ts`). Schema-aware autocomplete (`SchemaProvider`,
DL-014) as a follow-on. Tests: a provider/store + one plugin interaction path.

---

## Review R2 follow-up — DL-019 state refactor + DL-017 components + HIGH-2 pin

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests green (6 passed across 2 files); typecheck clean;
  prod build OK.
- **Trigger:** `FRONTEND_REVIEW_LOG.md` Review R2 directives (DL-019, DL-017) + R1 HIGH-2.

### DIRECTIVE-1 (DL-019, supersedes DL-012) — custom store → plain Context + `useState`

- **Deleted:** `state/createStore.ts`, `hooks/useStore.ts`, `hooks/useEditorSelector.ts`,
  `hooks/useQuerySelector.ts`, and their tests (`createStore.test.ts`, `useEditorSelector.test.tsx`).
- `EditorProvider`: `useState` + memoized context value; thin `useEditor()` = `useContext` wrapper.
- `QueryProvider` / `useRunQuery`: the `idle│running│done│error` machine now runs on `useState` +
  `AbortController`; thin `useQuery()` wrapper. `apiClient` still injectable (DIP).
- `App`: connected wrappers consume `useEditor()` / `useQuery()`.
- **Re-render isolation now comes from one-provider-per-concern (DL-010), not selectors:**
  `ResultsRegion` consumes only `QueryContext`, so typing never re-renders results; the expensive
  `EditorSurface` is `React.memo` with stable props, so query-state changes don't re-render it.
- No selector/Zustand layer added — that's the documented scale-up path only on *measured* churn
  (DL-008/DL-019).

### DIRECTIVE-2 (DL-017) — components on Click UI primitives

- `StatementResultCard`: status → Click UI **Badge** (success/danger); index, SQL, metrics →
  **Text**. The outer card stays a **thin layout container** — verified the Click UI `Card*`
  components (Primary/Secondary/Horizontal) are rigid tiles (title/icon/description/badge props,
  **no children slot**) and can't wrap a data table; this is the sanctioned layout-shell exception.
- `StatusBar`: Click UI **Badge** (run state) + **Text** (summary); removed the bespoke status-dot.
- `ResultTable` (**Table**), `ErrorBanner` (**Alert**), `RunButton` (**Button**) were already
  compliant. `Toolbar` remains a layout shell; its only control is the Click UI Button.

### HIGH-2 — pin `@clickhouse/click-ui`

- `package.json`: `"latest"` → `"^0.6.1"`; lockfile synced so `npm ci` stays consistent. No other
  floating specifiers among the frontend deps.

### Verification

- `npm run test:web` → **6 passed** (2 files). `tsc -p web/tsconfig.json --noEmit` → clean.
  `npm run build` → **2546 modules**, `dist/public` emitted.

### Not addressed here (other owners / coordination)

- **HIGH-1** (root Vitest workspace so `npm test` runs FE too): joint — touches the backend's root
  Vitest config; left untouched to avoid clobbering parallel work. Frontend runs via `test:web`.
  Needs an explicit owner.
- **HIGH-3** (DL-001's stale `cui.css` instruction): decision-log / skill / `CLAUDE.md` correction,
  owned by the doc maintainer.
- **HIGH-COORD** (prod SPA serving at `GET /`): backend-owned. The root `dev` (`concurrently`)
  script is now present in `package.json`.
- **NOTES** (hardcoded hex vs theme tokens, single-chunk bundle size) remain non-blocking.

---

## DL-020 follow-up — TanStack Query as the server-state layer

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests green (6 passed across 2 files); typecheck clean;
  prod build OK.
- **Trigger:** `DECISION_LOG.md` DL-020 — adopt `@tanstack/react-query` as the server-state /
  data-fetching layer (supersedes DL-014).

### What changed

- Added **`@tanstack/react-query` ^5.101.0**.
- **`useRunQuery` now wraps `useMutation`** (idle/pending/success/error) instead of `useState`.
  Mutations have no built-in `AbortSignal`, so an `AbortController` is kept in a ref for
  cancel + supersede; `cancel()` aborts then calls `mutation.reset()` — which detaches the
  observer, so the aborted request's rejection is ignored (no error flash). Results are **never
  cached** (DL-014 freshness preserved — a mutation, not a query).
- Kept the `RunState` union + a small `status → RunState` mapping, so the pure components
  (`ResultsPanel`, `StatusBar`, `StatementResultCard`) are **unchanged** and stay decoupled from
  TanStack.
- **`main.tsx`:** `QueryClientProvider` added (Click UI → QueryClient → Editor → Query → App).
  Client configured with `mutations.retry: false` and a default query `staleTime` for the future
  history/saved/schema reads.
- `QueryProvider` is unchanged in shape — still the thin shared context over `useRunQuery`, so
  `RunControls` / `EditorPane` / `ResultsRegion` share one mutation instance.
- **UI state (the editor document) stays plain Context + `useState` (DL-019)** — server-state vs
  UI-state separation is the whole point.

### Tests

- The `useRunQuery` test wraps the hook in a fresh `QueryClientProvider` per test and uses
  `waitFor` for TanStack's async-scheduled notifications (synchronous asserts-after-`act` miss
  them). Same four cases: idle→running→done, transport error, cancel→idle, supersede-in-flight.
- The `runFlow` integration test wraps `QueryProvider` in `QueryClientProvider`; assertions
  unchanged (`findByText` already polls).

### Verification

- `npm run test:web` → **6 passed** (2 files). `tsc -p web/tsconfig.json --noEmit` → clean.
  `npm run build` → `dist/public` emitted (JS +~9 kB gzip for TanStack, in line with DL-020's
  ~13 kB estimate).

### Follow-ons

- History / saved queries / schema become `useQuery` against this same client, with
  `invalidateQueries` on mutation (DL-020/DL-013) — Slice 3.
- `api/apiClient.ts` stays the thin typed fetch fn (`runQuery` + `ApiError`) the `mutationFn`
  calls — the only custom data code (DL-020).

---

## UI follow-up — Click UI containers + design tokens + dark/light switcher + reducers

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests green (6 across 2 files); typecheck clean; prod
  build OK.
- **Trigger:** user feedback — (1) `ResultsPanel` rendered bare `<div>`s; (2) styling used
  hardcoded hex instead of Click UI tokens; (3) add a dark/light switcher; (4) prefer
  `useReducer` + actions over `useState`. Also: `App.tsx` split into containers.

### Click UI layout primitives (DL-017)

- `ResultsPanel`: bare divs → **`Container`** (padding/gap/orientation).
- `StatementResultCard`: bespoke card → **`Panel`** (hasBorder/radii/color) + header/body
  `Container` + `Separator`; `Badge` for status, `Text` for metrics. (Click UI `Card*` are rigid
  tiles with no children slot — confirmed — so `Panel` is the correct surface primitive.)
- `StatusBar`: custom footer → **`Panel`** (muted strip) + `Badge` + `Text`.
- `ResultsRegion`: scroll area → **`Container`** (`grow` / `isOverflowScroll`).
- Remaining bespoke CSS is just the **layout shell** (toolbar/grid/panes — sanctioned) plus the
  truncated SQL line and the Table column-header (content Click UI has no primitive for).

### Design tokens (theme-aware styling)

- `styles.css` hardcoded hex → **`var(--click-global-color-*)`** tokens (stroke-muted,
  text-default/muted). Page background + base text come from Click UI's `GlobalStyle`. Verified
  the provider sets `<html data-cui-theme="light|dark">`, under which those token variables are
  defined — so the shell re-themes automatically with the switcher.

### Dark/light switcher

- `ThemeProvider` owns `light|dark` and feeds `ClickUIProvider`'s `theme` prop
  (`persistTheme={false}` — we persist to our own `localStorage` key). `ThemeSwitcher` (a Click UI
  `Button`) in the toolbar toggles it. `main.tsx`: `ThemeProvider` is outermost so the whole tree
  is theme-driven. Re-themes Click UI components (styled-components theme) **and** the shell CSS
  (`data-cui-theme` tokens).

### Reducer + actions (DL-019)

- `EditorProvider` and `ThemeProvider` use **`useReducer`** with an action union + semantic action
  creators (`setDoc`, `toggleTheme`); persistence is an effect so the reducer stays pure. (DL-019
  already sanctions `useState`/`useReducer` — this is the reducer variant.)

### App.tsx broken up

- Connected wrappers extracted to **`containers/`** — `EditorPane`, `RunControls`,
  `ResultsRegion`, `ThemeSwitcher`. `App.tsx` is now just the layout/composition root;
  `components/` stays pure, `containers/` holds the stateful wrappers.

### Verification

- `npm run test:web` → **6 passed**. `tsc -p web/tsconfig.json --noEmit` → clean. `npm run build`
  → `dist/public` emitted. Theme attribute (`data-cui-theme`) verified so the custom-CSS tokens
  re-theme with the switcher. **Light/dark confirmed in-browser by the product owner** (2026-06-20).

---

## Slice 3a — Plugin seam + Examples picker (DL-006)

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests green (9 across 4 files); typecheck clean; prod
  build OK.
- **Plan phase:** 6 (plugins) — the registry seam + the first concrete plugin. History and
  saved-queries plugins are the next chunks (3b/3c).

### What was built

| File | Responsibility |
|---|---|
| `web/src/data/goldenQueries.ts` | The **shared** golden dataset (DL-016): simple SELECT, `numbers()` aggregation, `system.tables` browse, a self-contained multi-statement Memory script, a deliberately invalid query. One source of truth for the Examples picker **and** backend test fixtures. |
| `web/src/plugins/types.ts` | `EditorPlugin` + `PluginContext`. Minimal per DL-008 — `toolbarLabel`/`title`/`renderPanel(ctx, close)` + `setDoc`/`run`; CodeMirror-extension and command contribution points deferred until a plugin needs them. |
| `web/src/plugins/PluginProvider.tsx` | Holds the registered plugins; `usePlugins()`. |
| `web/src/plugins/examplesPlugin.tsx` | Lists the golden queries; selecting one loads it into the editor (`setDoc`) and closes the panel. |
| `web/src/containers/PluginBar.tsx` | A toolbar toggle button per plugin (active button = primary). |
| `web/src/containers/PluginPanel.tsx` | Renders the active plugin's panel as an **in-layout side rail** (Click UI `Panel`, no overlay/portal); builds the `PluginContext`. |
| `main.tsx` / `App.tsx` / `styles.css` | `PluginProvider plugins={[examplesPlugin]}` in the tree; `App` owns the open-panel state and lays out the rail beside the editor/results; token-styled `.example-item` row. |

### Architecture

- **OCP (DL-006):** new addons attach via the registry; the editor core is untouched. Examples is
  the first plugin; History and Saved queries follow the same `renderPanel(ctx, close)` shape
  (list → load/run), with Saved adding mutations (DL-013/DL-020).
- **In-layout Click UI `Panel` side rail** for the panel (DL-017) — rendered in the normal flex
  flow (no overlay/portal/positioning), so it behaves identically in jsdom and a real browser. The
  only bespoke bit is the two-line clickable list row. Open state is local to `App`.

### Verification

- `npm run test:web` → **9 passed** (4 files): `examplesPlugin` (selecting an example calls
  `setDoc(sql)` + `close`; dataset sanity), `PluginBar` (clicking the toolbar button opens the
  panel), plus the existing `useRunQuery` / run-flow tests. `tsc` clean. `npm run build` →
  `dist/public` emitted.

> **Corrections (product-owner feedback):**
> - **Golden dataset stays shared** at `web/src/data/goldenQueries.ts` (DL-016) — an earlier
>   inlining was reverted; it's the FE/BE contract.
> - **Examples panel: Flyout → in-layout side rail.** The Click UI Flyout defaulted to
>   `strategy="relative"`, rendering inline/collapsed in the toolbar (invisible — "the button does
>   nothing"). Per product-owner call it's now a plain in-layout Click UI `Panel` rail (no
>   overlay/portal), so it can't render off-screen; guarded by the `PluginBar` test.
> - **Editor dark theme.** `EditorSurface` takes a `theme` prop wired to `useTheme()`, so
>   CodeMirror follows light/dark (it has its own theming, separate from Click UI's tokens).
> - **Removed the redundant `dev:web` script** (inlined `vite` into `dev`); `npm test` already runs
>   both suites via the root Vitest workspace.

### Next

- **Slice 3b — History plugin:** `useQuery` over `GET /api/history` (backend done), load/re-run via
  `PluginContext`. **Slice 3c — Saved queries:** `useQuery` + save/delete `useMutation` with
  `invalidateQueries` (DL-013/DL-020). Schema-aware autocomplete (DL-014 → `useQuery`) as a
  follow-on.

---

## R4 follow-up — eliminate keystroke re-renders (DL-010)

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests green (10 across 5 files); typecheck clean; build OK.
- **Trigger:** Review R4 NOTE — `PluginPanel` and `RunControls` re-rendered on **every keystroke**
  because they read the single `useEditor()` context (which changed each `doc` update) just for its
  actions / emptiness.

### Fix

`EditorProvider` now exposes **three contexts split by update frequency** (DL-010 — still plain
React Context, no selector lib, DL-019):

| Context | Changes | Consumed by |
|---|---|---|
| `EditorDocContext` (`doc`) | every keystroke | `EditorPane` only (it renders the document) |
| `EditorIsEmptyContext` (`isEmpty`) | rarely (empty ⇄ non-empty) | `RunControls` (its `disabled` state) |
| `EditorActionsContext` (`{ setDoc, getDoc }`) | never (stable) | `EditorPane`, `RunControls`, `PluginPanel` |

- Typing now re-renders **only the editor surface**. `RunControls` re-renders only when emptiness
  flips; `PluginPanel` doesn't re-render on typing at all (it reads actions + query state).
- `getDoc` is a ref-backed stable reader, so `RunControls` runs the *latest* document without
  subscribing to it.

---

## Note — running is button-only

- **Date:** 2026-06-20
- Running is button-only. `EditorSurface` takes no CodeMirror `extensions` prop (nothing contributed
  one — DL-008); re-add that seam when a plugin actually needs CM extensions.

---

## Slice 3b — History plugin (DL-006 / DL-013 / DL-020)

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests green (11 across 6 files); typecheck clean; build OK.
- **Plan phase:** 3/6 — persistence surfaced as an editor plugin. Saved queries (3c) is next.

### What was built

| File | Responsibility |
|---|---|
| `web/src/api/types.ts` | `HistoryEntry` — mirrors the backend type (DL-013). |
| `web/src/api/history.ts` | `fetchHistory` (`GET /api/history`) + `HISTORY_QUERY_KEY`. |
| `web/src/hooks/useHistory.ts` | TanStack `useQuery` over the history (DL-020). |
| `web/src/plugins/historyPlugin.tsx` | "History" panel: lists runs (timestamp + status `Badge` + first-line SQL); selecting one loads its SQL into the editor. |
| `web/src/hooks/useRunQuery.ts` | The run mutation's `onSettled` invalidates `HISTORY_QUERY_KEY`, so history refreshes after each run (DL-020). |
| `main.tsx` / `styles.css` | Registers `historyPlugin` next to `examplesPlugin`; `.history-item__sql` single-line preview. |

### Notes

- **Hooks safety:** `renderPanel` returns a `<HistoryList>` element (not a hook call), so `PluginPanel`
  doesn't call hooks conditionally when the active plugin changes.
- Loading / error / empty states all rendered. Selecting a run loads its SQL (panel stays open);
  re-run is a trivial follow-on (`ctx.run` is already available).
- **Test:** `historyPlugin` renders from a mocked `fetch` and loading a run calls `setDoc`.

### Next

- **Slice 3c — Saved queries:** `useQuery` list + save/delete `useMutation` with `invalidateQueries`
  (DL-013/DL-020); a `saveQueryPlugin` (save the current script + a named list).
- New `EditorProvider` test asserts an actions-only consumer renders **once** across document edits
  (regression guard for exactly this issue). This relies on the children-as-props bail-out plus the
  context split.

---

## Slice 3c — Saved queries plugin (DL-006 / DL-013 / DL-020)

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests green (13 across 7 files); typecheck clean; build OK.
- **Plan phase:** 3/6 — third persistence plugin; completes the examples/history/saved trio.

### What was built

| File | Responsibility |
|---|---|
| `web/src/api/types.ts` | `SavedQuery` + `NewSavedQuery` mirror the backend (DL-013). |
| `web/src/api/savedQueries.ts` | fetch/create/delete + `SAVED_QUERIES_QUERY_KEY` (`/api/queries`). |
| `web/src/hooks/useSavedQueries.ts` | `useSavedQueries` (useQuery) + save/delete mutations that invalidate the list (DL-020). |
| `web/src/plugins/saveQueryPlugin.tsx` | "Saved" panel: TextField + "Save current query" (saves `ctx.getDoc()`), CardHorizontal list (click to load) + Delete. |
| `web/src/plugins/types.ts` + `containers/PluginPanel.tsx` | `PluginContext` gains `getDoc()`. |
| `main.tsx` | Registers `saveQueryPlugin` (examples + history + saved). |

### Notes

- Save disabled until a name + non-empty editor; name clears on success. Mutations invalidate the
  saved-queries query so the list stays in sync (DL-020).
- Tests: list + load (click a card); save (TextField -> POST `{ name, sql }`).

### Next

- Plugin trio complete. Remaining: schema autocomplete (DL-014) and file import (`fileImportPlugin`)
  via the same seam.

---

## DL-026 — icon activity-rail + editor/save icon buttons

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests green (13 across 7 files); typecheck clean; build OK.

### What changed

- `EditorPlugin` gains `icon` (IconName) + `placement?: 'left'|'right'` (default left).
- Plugin toggles moved from toolbar text buttons to a left **icon activity-rail** (`PluginRail`):
  icon-only Click UI `Button` + `Tooltip` + `aria-label`(=toolbarLabel)/`aria-pressed`/`aria-expanded`.
  Grouped by placement; the right rail renders only once a right-placement plugin exists (seam).
  Icons: examples=`cards`, history=`history`, saved=`star`.
- **Why Button, not IconButton:** Click UI `IconButton` hardcodes `aria-label` to the icon name, so
  an icon-only `Button` (`iconLeft`) is used to keep `aria-label` = `toolbarLabel` (DL-026 a11y).
- **Editor pane** gains a copy (`copy`) + clear (`cross`) icon-button toolbar above CodeMirror.
- **Saved queries:** Save is now an inline `disk` icon button beside the name field; Delete is a
  `trash` icon button.

### Verification

- `npm run test:web` -> 13 passed (7 files); `tsc` clean; `npm run build` OK. `PluginBar` test
  became `PluginRail` (clicks the icon toggle by its aria-label).

---

## Slice 3d — Schema explorer + autocomplete (DL-025)

- **Date:** 2026-06-20
- **Status:** Complete, awaiting review. Tests green (152 across 18 files, +6 new); typecheck clean;
  prod build OK.
- **Plan phase:** schema explorer + autocomplete, scheduled after Saved queries (DL-025).

### What was built

| File | Responsibility |
|---|---|
| `web/src/api/schema.ts` | `fetchSchema` runs the existing **`POST /query`** (via `apiClient.runQuery`) against `system.columns` — **no new backend endpoint** (DL-025) — and `rowsToTree` transforms the flat `{database,table,column,type}` rows (from `RunResponse.statements[0].rows`) into a `database → table → columns[{name,type}]` tree. Exposes `SCHEMA_QUERY_KEY` + `SchemaTree`/`SchemaDatabase`/`SchemaTable`/`SchemaColumn`. |
| `web/src/hooks/useSchema.ts` | TanStack `useQuery` (key `['schema']`, `staleTime` 5 min) wrapping `fetchSchema` (DL-020). One query feeds both the panel and autocomplete. |
| `web/src/plugins/schemaPlugin.tsx` | `EditorPlugin` (`placement: 'right'`, icon `database`, label/title `Schema`): databases → tables → **expandable columns** via Click UI `Accordion` (nested) + `Text`; loading/error/empty states; the hook is wrapped in a child component (hook-safety, mirrors History/Saved). An `insert-row` `IconButton` per table inserts the table name into the editor — `appendIdentifier(ctx.getDoc(), name)` (whitespace-separated append, since `PluginContext` only has `setDoc`/`getDoc`). |
| `web/src/components/EditorSurface.tsx` (edit) | Stays **pure**: new optional `schema?: Record<string,string[]>` prop; builds `sql(schema ? { schema } : undefined)` (schema-aware autocomplete, DL-025), memoized on `schema`. Value/onChange/theme unchanged. |
| `web/src/containers/EditorPane.tsx` (edit) | Calls `useSchema`, reshapes the tree to the `{ [table]: string[] }` map `sql({ schema })` expects (tables keyed both unqualified `events` and qualified `db.events`), and passes it to `EditorSurface`. |
| `web/src/main.tsx` (edit) | Registers `schemaPlugin` (examples, history, saved, **schema**). |

### Why / key decisions

- **One cached query, two consumers (DL-025/DL-020):** `useSchema` is the single source for the
  panel **and** autocomplete, so `system.columns` is read once.
- **No backend work (DL-025):** reuses `POST /query`; `fetchSchema` surfaces a per-statement SQL
  error as an `ApiError` so `useQuery` reports `isError`.
- **Click UI first (DL-017):** the expandable tree uses Click UI `Accordion` (nested databases →
  tables) rather than a bespoke disclosure; columns are `Text` rows.
- **Pure surface preserved (DL-019/DL-023):** the editor stays presentational — the container owns
  the `useSchema` call and the shape transform.

### Placement change (product-owner directive, 2026-06-20)

Per the product owner, the schema/inspector panel docks on the **right**, not the left — it's the
inspection/detail side of the rail (DL-026). Implemented with the existing `placement` seam:

- `schemaPlugin.placement = 'right'`.
- `App.tsx`: independent left/right open-state + a second `<PluginRail placement="right">` and a
  right-docked `<PluginPanel placement="right">` after the editor body, so a left "source" panel
  (Examples/History/Saved) and the right Schema panel can show **simultaneously** (DL-026).
- `PluginPanel` gains a `placement?` prop → `plugin-panel--left|right` class; `styles.css` moves the
  panel border to the docking edge (`--left` border-right, `--right` border-left). The right rail
  was already supported by `PluginRail` (placement-parameterized; renders nothing with no
  right-placement plugin).

### Tree indentation (product-owner feedback, 2026-06-20)

Click UI's `Accordion` doesn't indent its content, so nested tables/columns sat flush with their
parent. Wrapped each accordion's children in a `.schema-tree__children` div (left margin/padding +
a guide line via design tokens) so the database → table → column hierarchy reads as a tree.

### Tests (DL-015)

- `web/src/api/schema.test.ts` — `rowsToTree`: grouping, empty input, skipping malformed rows.
- `web/src/plugins/schemaPlugin.test.tsx` — renders from a mocked `fetch` returning a `RunResponse`;
  expanding a database and clicking "Insert" appends the table name via `setDoc`.
- `web/src/components/EditorSurface.test.tsx` — mounts with and without a `schema` prop (the
  `sql({ schema })` autocomplete extension builds).

### Verification

- `npm test` → **152 passed** across 18 files (baseline was 146).
- `tsc -p web/tsconfig.json --noEmit` → clean.
- `npm run build` → `dist/public` emitted (2613 modules; CSS 311 kB / 32 kB gz, JS 1.67 MB /
  490 kB gz; pre-existing >500 kB single-chunk warning, unchanged scope).

### Not verified

- Not clicked through live against real ClickHouse (no running backend/container in this slice);
  the data path is exercised in tests via a mocked `RunResponse` matching the `/query` contract.

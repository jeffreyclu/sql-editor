# Frontend Review Log

Principal-engineer review of the frontend track. Append-only, newest at the bottom.
Scope per pass: **blocking issues + high-priority items only** (style/polish nits are
skipped). Findings are graded against the `sql-editor-engineering` skill and
`DECISION_LOG.md` (DL-xxx), plus correctness and FE↔BE contract consistency.

Grades: **BLOCKER** (must fix before merge/build) · **HIGH** (fix before this area
hardens / before relying on it) · **NOTE** (non-blocking, logged for traceability).

---

## Review R1 — Slice 1: Frontend foundation + editor surface

- **Date:** 2026-06-19
- **Reviewed:** `web/**`, `vite.config.ts`, `tsconfig.node.json`, `package.json`
  (frontend portions), against `FRONTEND_BUILD_LOG.md` Slice 1.
- **Verdict:** ✅ **Approve to continue** (Slice 2 not blocked). No hard blockers.
  3 HIGH items + 1 HIGH cross-track coordination item.

### What's solid (verified, not just claimed)
- **Selector architecture is correct (DL-012).** `useStore` is a faithful, zero-dep
  `useSyncExternalStoreWithSelector`: ref-cached slice + `isEqual` (default `Object.is`) so a
  component re-renders only when *its* slice changes. Context carries the **store handle** and a
  **stable actions handle** — data is never read via raw `useContext`. Fully compliant.
- **Frequency split (DL-010):** editor document isolated in its own store; results store slots in
  later so keystrokes never cross-render results.
- **Layering (DL-005):** pure, `React.memo` components (`EditorSurface`, `Toolbar`); wiring lives
  in `App` (composition root), not in `components/`. Editor is CodeMirror (DL-002); `ClickUIProvider`
  at the root (DL-001). Click UI-first honored — bespoke UI limited to the editor + app shell.
- **FE↔BE contract** (`web/src/api/types.ts`) still matches backend `types.ts` exactly.
- `npm run test:web` → **7 passed**; build log reports typecheck clean + prod build OK.

### HIGH-1 — Frontend tests are excluded from the canonical `npm test`
- **Where:** `vitest.config.ts:14` (`include: ['src/**/*.test.ts']`, node env) vs.
  `package.json` (`test` → root config; `test:web` → `web/vitest.config.ts`).
- **Problem (verified):** `npm test` runs **backend only** — `npx vitest list` against the root
  config sees **0** web test files. A reviewer or CI running the conventional `npm test` silently
  skips *all* frontend tests, so the FE test suite contributes nothing to the "tests exist" bar
  (DL-015) under the canonical command. The root config's own comment says it "should grow into
  Vitest `projects`."
- **Fix:** make `npm test` run both via a root Vitest **workspace/`projects`** (node `server`
  project on `src/**` + jsdom `web` project on `web/**`). Shared root config → joint/coordination
  change. Both build logs deferred this; raising to HIGH because the default command hides FE tests.

### HIGH-2 — `@clickhouse/click-ui` pinned to `"latest"` (non-reproducible)
- **Where:** `package.json:18` → `"@clickhouse/click-ui": "latest"`.
- **Problem:** `"latest"` floats on any fresh `npm install` / lockfile refresh. This is the
  design-system dep, and the build log itself documents **version-specific behavior** (v0.6.1's
  `exports` map / CSS delivery). A future install could pull a new major and break styling or the
  build with no code change. Reproducibility is part of maintainability (eval criterion #2).
- **Fix:** pin to the resolved range, e.g. `"^0.6.1"`. (Quick audit the other new deps for any
  other floating specifiers while here.)

### HIGH-3 — Contract docs prescribe a Click UI CSS import that breaks the build (DL-001 stale)
- **Where:** `DECISION_LOG.md` DL-001, the skill, `CLAUDE.md`, and `IMPLEMENTATION_PLAN.md` all
  instruct `import '@clickhouse/click-ui/cui.css'`. The frontend **correctly did not** add it
  (`web/src/main.tsx` relies on the JS import graph) and verified styles still bundle (277 kB CSS).
- **Problem:** Installed Click UI **v0.6.1 exposes no `cui.css` subpath**, so following the
  contract literally would break the Vite build. Because the whole point of the skill + `CLAUDE.md`
  is that **every agent loads it before building (DL-018)**, a misleading instruction in the
  contract is high-impact: the next agent that obeys it breaks. This is the sanctioned
  "deviation that's actually correct → log it" case.
- **Fix:** correct DL-001 (and the skill / `CLAUDE.md` / plan) to state that v0.6.1 delivers styles
  via `ClickUIProvider`'s import graph — **no manual CSS import**. Code needs no change; the
  contract must catch up. (Doc owner action — can be applied on request.)

### HIGH-COORD — End-to-end "open `/` → editor" not yet met (unassigned ownership)
- **Where:** `src/server/app.ts` (no `/` route after removing "Hello world!"); no root `dev` script.
- **Problem:** The README's core acceptance — *opening `/` renders the React app* — currently works
  only under `vite` (dev), not via the Express server. Prod SPA serving (`express.static('dist/public')`
  + SPA fallback at `GET /`) and a concurrent `npm run dev` (server + vite) are unwired. `dist/public`
  now exists, so this is ready to do — but it spans both tracks and **no one owns it**.
- **Recommendation:** backend adds the static-serving + fallback in `createApp` (owns `src/`);
  a small root `dev` (`concurrently`) script wires both. Assign explicitly so it doesn't fall
  through the parallel-work crack. DL-007.

### NOTES (non-blocking; logged for traceability)
- **DL-007 cleanup:** `tslint` (EOL) still in devDeps; `body-parser` still a dep though unused.
  (Mirror of backend R1 note — single shared `package.json`.)
- **Bundle size:** JS ~1.53 MB / 451 kB gzip in one chunk (CodeMirror + Click UI + React).
  Code-splitting (`manualChunks` / dynamic import of the editor) is a fair later optimization.
- **`styles.css` hardcodes hex colors** (`#e4e4e7`, `#71717a`, `#faff00`) rather than Click UI
  theme tokens; fine for the app shell now but won't track the provider theme (e.g. dark mode).
- **Vite 6 / oxc deprecation warnings** from `@vitejs/plugin-react` are cosmetic.

### Coordination
- HIGH-1 (Vitest workspace) and HIGH-COORD (prod serving + `dev`) are **joint** — they touch the
  shared root config / `src/`. Recommend one explicit owner each.
- HIGH-3 is a decision-log correction owned by the doc maintainer (me); flag to both agents once
  updated so neither re-adds the bad import.

---

## Review R2 — Directives from decision changes (DL-019, DL-017 enforcement)

- **Date:** 2026-06-20
- **Trigger:** Product-owner decisions during R1 follow-up. These are **directives for the
  frontend agent's next slice**, not new code findings.

### DIRECTIVE-1 — Replace the custom store with plain Context + `useState` (DL-019, supersedes DL-012)
- The custom `createStore` + selector hook reimplements React's official
  `useSyncExternalStoreWithSelector`; per the "absolute barebones" decision we drop it.
- **Do:** delete `web/src/state/createStore.ts`, `web/src/hooks/useStore.ts`,
  `web/src/hooks/useEditorSelector.ts` and their tests (`createStore.test.ts`,
  `useEditorSelector.test.tsx`). Refactor `EditorProvider` to `useState` + a memoized context
  `value`; expose a thin `useEditor()` = `useContext` wrapper. Re-render isolation comes from
  **one provider per concern** (DL-010), not selectors.
- **Don't:** add Zustand / `use-context-selector` / the official shim now — only if a hot context
  later shows *measured* churn (DL-008). Zustand is the documented scale-up path.

### DIRECTIVE-2 — Click UI first; custom UI only for the editor + layout shells (DL-017)
- **Finding:** the slice trends toward custom components (`Toolbar` now; `StatementResultCard`,
  `ResultTable`, `ErrorBanner`, `StatusBar` planned) where Click UI has equivalents.
- **Sanctioned custom UI = exactly two things:** (1) the CodeMirror editor (DL-002), and
  (2) thin **layout containers** with no Click UI primitive (app shell, results-panel wrapper,
  toolbar strip). Everything else composes Click UI:
  - `StatementResultCard` → Click UI **Card** (+ **Badge**/**Text** for status·timing·rowCount)
  - `ResultTable` → Click UI **Table** (do **not** hand-roll a data grid)
  - `ErrorBanner` → Click UI **Alert**
  - `StatusBar` → Click UI **Text**/**Badge**
  - Run/Cancel + plugin toolbar actions → Click UI **Button**
- **Caveat (avoid a stale-contract repeat of HIGH-3):** verify exact component names/props against
  the Click UI storybook (v0.6.1) before use; the mapping above is by capability, not verified API.
- **`Toolbar`** as a layout shell is acceptable (no CH toolbar primitive), but its action controls
  must be Click UI Buttons, not bespoke.

### DIRECTIVE-3 — Use TanStack Query as the data layer (DL-020, supersedes DL-014)
- **Do:** add `@tanstack/react-query` + a `QueryClientProvider` in `main.tsx`. Build the Slice 2
  data layer as: thin typed fetch fns in `api/client.ts`; `api/queries.ts` exposing `useRunMutation`
  (run-query via `useMutation`, `AbortSignal`, **not cached**), and `useHistory` / `useSavedQueries`
  / `useSchema` (`useQuery`). Save/delete mutations call `invalidateQueries`. Schema: long
  `staleTime` + manual refetch.
- **Don't:** build the planned custom `apiClient` state plumbing, a `useRunQuery` state machine, or
  `QueryProvider`/`HistoryProvider`/`SavedQueriesProvider`/`SchemaProvider` Context stores — TanStack
  replaces them. Context + `useState` (DL-019) remains for **UI state only** (editor doc, plugins).
- **Test:** the run `useMutation` hook wrapped in a `QueryClientProvider` (DL-015).

> All three directives are reflected in `IMPLEMENTATION_PLAN.md`, the skill, and `CLAUDE.md`.
> `web/src/api/types.ts` ↔ backend contract is unaffected.

---

## Review R3 — re-review (Slice 2 run→results, DL-019/017/020 directives, new UI decisions)

- **Date:** 2026-06-20
- **Reviewed:** all of `web/src/**` (run→results, providers, containers, components, theming).
  `npm run test:web` → **6 passed**; build/typecheck green per build log.
- **Verdict:** ✅ **Approve — no blockers, no high-priority issues.** Excellent quality.

### Directives & prior findings — verified resolved
- **DL-019 refactor done:** custom store/selector files deleted; `EditorProvider` is Context +
  `useReducer`; thin `useEditor()`/`useQuery()` `useContext` wrappers. No selector/Zustand layer.
- **DL-020 done:** `useRunQuery` wraps `useMutation` (never cached); `AbortController` ref for
  cancel/supersede; a `RunState` union keeps presentational components decoupled from TanStack
  (nice anti-corruption boundary). `QueryClientProvider` in the tree; `mutations.retry:false`.
- **DL-017 done:** components compose Click UI (`Table`/`Alert`/`Button`/`Badge`/`Text`/`Panel`/
  `Container`/`Separator`); custom UI limited to the editor + layout shell + truncated-SQL/column-header.
- **HIGH-2 fixed:** `@clickhouse/click-ui` pinned `^0.6.1` (no floating specifiers).
- **Re-render isolation (DL-010) holds:** `ResultsRegion` reads only the query provider (typing
  never re-renders results); `EditorSurface` is `React.memo` with stable props (running doesn't
  re-render the editor).

### New design decisions captured (logged in DECISION_LOG)
- **DL-021** Theming — dark/light `ThemeProvider` + Click UI design tokens (resolves the
  hardcoded-hex NOTE).
- **DL-022** Provider state via `useReducer` + action creators (refines DL-019).
- **DL-023** Container/presentational split with a `containers/` layer (refines DL-005).
- **DL-017 refinement** — `Panel`/`Container`/`Separator` for surfaces; Click UI `Card*` (no
  children slot) intentionally not used for result cards.
- Also noted (no new DL): dropped the speculative `services/queryService.ts` (apiClient *is* the
  service — DL-008).

### Still open (not blockers; carried forward)
- **HIGH-1** — unified `npm test` (root Vitest workspace) still not done; FE runs only via
  `test:web`. Joint/owner-needed.
- **HIGH-3** — DL-001's stale `cui.css` instruction (doc fix, pending owner go-ahead).
- **Coordination / Slice 3** — persistence (history/saved), plugins, golden dataset, and
  schema-autocomplete are deferred; `web/src/api/types.ts` does not yet mirror the backend's
  `HistoryEntry`/`SavedQuery` (add when those features land, via TanStack `useQuery` — DL-020).

---

## Review R4 — Slice 3a: plugin seam + Examples picker (DL-006/DL-016)

- **Date:** 2026-06-20
- **Reviewed:** `plugins/` (types, `PluginProvider`, `examplesPlugin`), `containers/PluginBar` +
  `PluginPanel`, `data/goldenQueries.ts`, `App.tsx`, `EditorSurface` theme prop. `npm test` →
  **88 passed** (9 web across 4 files).
- **Verdict:** ✅ **Approve — no blockers, no high-priority issues.**

### What's solid
- **OCP plugin seam (DL-006):** `EditorPlugin` + `PluginContext` are minimal (DL-008) — toolbar
  entry + `renderPanel(ctx, close)`; CM-extension/command points deferred until needed. Adding a
  plugin never touches editor core. `PluginProvider` supplies plugins at composition (swappable in tests).
- **Container split (DL-023):** `PluginBar`/`PluginPanel` are connected wrappers; the plugin def +
  golden list stay declarative; `App` owns only the open-panel id (local state — right for an
  infrequent toggle, DL-019).
- **Click UI (DL-017):** `Button`/`Panel`/`Container`/`Text`; the lone bespoke element is the
  two-line list row, a real `<button>` (keyboard-accessible) — justified (no CH list-item primitive).
- **Theming (DL-021):** `EditorSurface` gains a `theme` prop fed by `EditorPane`→`useTheme`, so
  CodeMirror follows light/dark while staying pure.
- Sensible pivots, documented: Flyout → in-layout `Panel` (Flyout rendered invisible); golden
  dataset kept shared (re-inlining reverted).

### NOTES (non-blocking)
- **DL-016 only half-realized.** `goldenQueries.ts` is consumed by the **frontend** (Examples +
  FE tests), but the **backend tests still use inline fixtures** — they don't import this file
  (and the `src/server` ↔ `web/src` boundary makes it awkward). Either wire BE tests to it or
  soften the "single source for backend fixtures" claim in the file/DL-016.
- **Re-render on keystroke:** `PluginPanel` (and `RunControls`) read the editor context for its
  *actions* but re-render on every `doc` change (coarse-context trade-off accepted by DL-019).
  Fine at this scale; if panels grow, split an actions-only context.
- **Minor a11y:** plugin toggle buttons could expose `aria-pressed`/`aria-expanded`.

### Coordination
- Slice 3b/3c (History, Saved queries) will follow the same `renderPanel` shape over TanStack
  `useQuery`/`useMutation` (DL-013/DL-020) and must mirror `HistoryEntry`/`SavedQuery` in
  `web/src/api/types.ts`.

---

## Review R5 — R4 follow-up: eliminate keystroke re-renders (DL-010)

- **Date:** 2026-06-20
- **Reviewed:** `EditorProvider` (3-context split), `RunControls`, `EditorPane`, `PluginPanel`,
  `EditorProvider.test.tsx`. `npm test` → **104 passed**.
- **Verdict:** ✅ **Approve — no blockers.** Resolves **R4 NOTE-2** (keystroke re-renders).

### What's solid
- **Three contexts split by update frequency** (DL-010, still plain Context — DL-019): `doc`
  (every keystroke), `isEmpty` (flips rarely), `actions` (`{ setDoc, getDoc }`, stable via
  `useMemo([])`). Each consumer subscribes to only what it needs.
- **Verified mechanism:** on a keystroke the provider re-renders, but `actions` is referentially
  stable, `isEmpty` keeps the same value, and `children` is a stable element (children-as-props
  bail-out) — so **only the `EditorDocContext` consumer (`EditorPane`) re-renders.** `RunControls`
  re-renders only on emptiness/runState change; `PluginPanel` not at all while typing.
- **`getDoc` ref-backed reader** → Cmd/Ctrl+Enter and Run execute the latest document without
  subscribing to it, keeping the CodeMirror extension stable (no per-keystroke reconfigure).
- **Regression test** asserts an actions-only consumer renders exactly once across two edits — the
  right guard for precisely this issue. Combined `useEditor()` fully removed (no stale refs).
- Not over-engineered: still plain React Context, no selector/store library; justified by the
  explicit re-render goal (memoization principle + DL-010).

### NOTE (non-blocking)
- **Doc drift:** the skill / plan still name a single `useEditor` wrapper; it's now
  `useEditorDoc` / `useEditorIsEmpty` / `useEditorActions`. The principle is unchanged
  (per-provider `useContext` wrappers, split by frequency) — worth a one-line sync.

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
- **`getDoc` ref-backed reader** → Run executes the latest document without subscribing to it,
  keeping the CodeMirror extension stable (no per-keystroke reconfigure).
- **Regression test** asserts an actions-only consumer renders exactly once across two edits — the
  right guard for precisely this issue. Combined `useEditor()` fully removed (no stale refs).
- Not over-engineered: still plain React Context, no selector/store library; justified by the
  explicit re-render goal (memoization principle + DL-010).

### NOTE (non-blocking)
- **Doc drift:** the skill / plan still name a single `useEditor` wrapper; it's now
  `useEditorDoc` / `useEditorIsEmpty` / `useEditorActions`. The principle is unchanged
  (per-provider `useContext` wrappers, split by frequency) — worth a one-line sync. *(Resolved in
  `cf73108`.)*

---

## Review R6 — results pane scroll fix

- **Date:** 2026-06-20
- **Reviewed:** `ResultsRegion.tsx` scroll fix. Web `tsc --noEmit` clean; `npm test` → **125 passed**.
- **Verdict:** ✅ **Approved — no blockers.**
- `isOverflowScroll` (no-op in Click UI v0.6.1) → `minHeight="0" overflow="auto"` on the `grow="1"`
  Container. Correct flexbox idiom — a flex child needs `min-height:0` to shrink below its content so
  `overflow` scrolls. Valid Click UI props (typechecks). Accurate code comment.
- Running is button-only (product-owner decision).

---

## Review R7 — Slice 3b: History plugin (DL-006 / DL-013 / DL-020)

- **Date:** 2026-06-20
- **Reviewed:** `api/types.ts` (`HistoryEntry`), `api/history.ts`, `hooks/useHistory.ts`,
  `plugins/historyPlugin.tsx` (+ test), `useRunQuery` `onSettled`, `main.tsx`, and the
  `examplesPlugin` Click UI change. `npm test` → **144 passed** (14 files).
- **Verdict:** ✅ **Approve — no blockers.**

### What's solid
- **FE↔BE contract exact:** `web` `HistoryEntry` mirrors backend `types.ts`
  (`id/sql/executedAt/status/statementCount/elapsedMs?/error?`) — no drift.
- **History invalidation:** the run mutation's `onSettled` invalidates `HISTORY_QUERY_KEY`, so
  history refreshes after every run **including errors** (the backend logs both; `onSettled` fires on
  both). Only refetches when the panel is mounted — no wasted fetches.
- **Hook safety:** `renderPanel` returns a `<HistoryList/>` component, so `useHistory` is never called
  conditionally from `PluginPanel`.
- **Plugin shape (DL-006):** same `renderPanel(ctx)` contract; load-into-editor via `ctx.setDoc`;
  loading / error / empty states all rendered.
- **DL-017 improved:** `examplesPlugin` now uses Click UI **`CardHorizontal`** (title/description/
  onClick) — more compliant than the prior bespoke button. The earlier red `PluginBar` test
  (`examplesPlugin` calling `useTheme` without a `ThemeProvider`) was fixed the right way — by
  dropping the unnecessary `useTheme`, not by patching the harness.
- **Test:** `historyPlugin.test` stubs `fetch`, renders, clicks a run → asserts `setDoc`. Substantive (DL-015).

### NOTE (non-blocking)
- Minor DL-017 inconsistency: examples use `CardHorizontal`, but history rows use a bespoke
  `<button class="example-item">` (timestamp + status `Badge` + SQL preview). Consider
  `CardHorizontal` (title = SQL, description = time, badge = status) for consistency — or keep if the
  richer row layout warrants it. Cosmetic.

### Coordination
- Re-run is a trivial follow-on (`ctx.run` is wired). Next: Slice 3c (Saved queries), then the
  Schema explorer + autocomplete slice (DL-025).

---

## Review R8 — Slice 3c (Saved queries) + DL-026 (icon activity-rail)

- **Date:** 2026-06-20
- **Reviewed:** `api/savedQueries.ts`, `hooks/useSavedQueries.ts`, `plugins/saveQueryPlugin.tsx`,
  `plugins/types.ts`, `containers/PluginRail.tsx`, `containers/PluginPanel.tsx`, `App.tsx`,
  `EditorPane.tsx`, `api/types.ts`. `npm test` → **146 passed** (15 files).
- **Verdict:** ✅ **Approve — no blockers.** Notes only.

### Solid
- **Contract exact:** FE `SavedQuery`/`NewSavedQuery` mirror the backend (`Pick<'name'|'sql'>` = the
  backend's `Omit`). `GET`→array, `POST`→entity, `DELETE`→void; `id` URL-encoded on delete.
- **DL-020:** `useSavedQueries` (useQuery) + save/delete `useMutation` invalidate the list `onSuccess`.
- **DL-026 seam:** `EditorPlugin` gains `icon: IconName` + `placement?: 'left'|'right'` (default left);
  `PluginRail` filters by placement and **renders nothing when empty**, so the right rail only appears
  once a right-placement plugin exists. `PluginContext` gains `getDoc()`; Save reads the live doc via
  the ref-backed `getDoc` (no subscription) — good.
- **DL-017:** Click UI `CardHorizontal`/`TextField`/`IconButton`/`Tooltip`/`Container` throughout.
  Hook-safety preserved (panels wrap their hooks in a component).

### NOTES (non-blocking)
- **Save disabled-state can be stale.** `canSave` reads `ctx.getDoc()` at render, but the panel
  doesn't subscribe to the editor doc (`getDoc` is a non-subscribing ref read), so the Save button's
  enabled/disabled state only refreshes when the name field re-renders. Harden `handleSave` to
  re-check `ctx.getDoc().trim()` at click (it already reads `getDoc()` for the payload — just guard on
  it), or gate on a subscribed emptiness signal.
- **DL-027 toasts not yet implemented.** The actions that should confirm — save/delete (saved
  queries) and copy/clear (editor pane) — now exist but fire no toast. This is the natural next step;
  in particular **clear (`setDoc('')`) is destructive with no confirmation** — a toast (or undo) is
  warranted. *(Resolved in R9.)*

---

## Review R9 — Toast notifications (DL-027)

- **Date:** 2026-06-20
- **Reviewed:** the staged toast changeset (isolated from concurrent schema work) — `hooks/useToast.ts`
  (new), `containers/EditorPane.tsx`, `plugins/saveQueryPlugin.tsx`.
- **Verdict:** ✅ **Approve — no blockers.**

### Solid
- **`useToast`** is a thin wrapper over Click UI's `createToast` (`success`/`error`/`info`/`show`), so
  containers/plugins/mutations fire toasts without importing toast internals (DL-027/DL-005/DL-017),
  swappable in one place.
- **Fired from the action layer:** save → "Query saved"/error and delete → "Query deleted"/error
  (mutation callbacks); copy → "Copied to clipboard"/error (handles the clipboard promise rejection);
  clear → "Editor cleared" with an **Undo** action that restores the previous doc.
- **Resolves two prior R8 notes:** Save now re-checks `ctx.getDoc()` at click (no stale-enable bug),
  and the destructive Clear is guarded + offers Undo.
- Does **not** toast query results/errors (already surfaced inline) — exactly per DL-027.

### NOTE (non-blocking)
- **No tests for the toast layer.** Worth one small test for the clear→Undo restore (the only
  non-trivial behavior); the rest is thin.

### Coordination (git hazard — not a code issue)
- A `git reset HEAD~2` un-committed the toast commit (`a723b22`) and the R8 review commit
  (`1a15084`); both survive **staged** (and in reflog) and need re-committing. Symptom of multiple
  agents committing to one branch.

---

## Review R10 — Slice 3d: Schema explorer + autocomplete (DL-025 / DL-028)

- **Date:** 2026-06-20
- **Reviewed:** `api/schema.ts` (+test), `hooks/useSchema.ts`, `plugins/schemaPlugin.tsx` (+test),
  `components/EditorSurface.tsx` (+test), `containers/EditorPane.tsx`, `containers/PluginPanel.tsx`,
  `App.tsx`, `main.tsx`, `styles.css`. `npm test` → **152 passed** (18 files); `tsc` clean; build OK.
- **Verdict:** ✅ **Approve — no hard blockers.** 1 HIGH follow-up.

### Solid
- **DL-025:** one cached `useSchema` (`useQuery`, 5-min `staleTime`) over the EXISTING `POST /query`
  (`system.columns`) feeds **both** the panel and autocomplete — no new backend endpoint. `rowsToTree`
  is defensive (type-guards, skips malformed rows, order-independent) and well-tested.
- **Autocomplete:** `EditorSurface` stays pure — optional `schema` prop → `sql({ schema })`,
  `extensions` memoized on `[schema]` so completion activates once schema loads (no per-keystroke
  rebuild). Bonus: line-wrapping.
- **DL-026/DL-028:** `schemaPlugin` `placement: 'right'`; `PluginPanel` is side-aware; `App` has
  independent left/right open-state (a left source + right schema can show together). Right rail built.
- **DL-017/DL-023:** Click UI `Accordion`/`Container`/`Text`/`IconButton`/`Panel`; only bespoke bits
  are the indent wrapper (Accordion doesn't indent) + the editor (sanctioned). Hook-safety preserved.
  Table insert appends the identifier via `getDoc`+`setDoc` (sensible per DL-025; ctx has no cursor API).
- Tests are substantive (transform cases + render→expand→insert). No new FE↔BE contract.

### HIGH-1 — schema fetches pollute query history — ✅ RESOLVED (DL-029)
- **Resolution:** `/query` now accepts `recordHistory: false` (DL-029); `fetchSchema` sets it, so
  schema reads aren't logged. Backend test added; `npm run test:server` → 134 pass.
- `fetchSchema` goes through `POST /query`, and the backend **auto-logs every `/query` run** to
  history (DL-013). `useSchema` fires when `EditorPane` mounts (app load), and on each refetch — so a
  `SELECT … FROM system.columns` row the user never ran is recorded and surfaces in the **History
  panel**. The schema feature pollutes the history feature.
- **Fix (FE+BE coordination):** give `/query` a "don't log" path for internal reads (e.g. a header/flag
  the schema fetch sets; the route skips `recordHistory`), **or** add the dedicated `/api/schema`
  endpoint that DL-025 documented as the fallback ("revisit if needed" — this is the trigger).

### NOTES (non-blocking)
- Schema is fetched eagerly on app load even if the panel never opens (one `system.columns` query per
  load). Tied to HIGH-1; acceptable once that's resolved (autocomplete wants it eagerly).
- Insertion appends at the doc end, not at the cursor (ctx exposes no selection API) — fine per DL-025.

### Coordination
- HIGH-1 spans FE + BE. Also: `schemaPlugin` is now right-placed (DL-028), so plan/skill lines that say
  "right panel deferred" are stale (decision-keeper follow-up).

---

## Review R11 — Slice 3e: File import plugin (DL-006)

- **Date:** 2026-06-21
- **Reviewed:** `api/import.ts` (+test), `hooks/useImportFile.ts`, `plugins/fileImportPlugin.tsx`
  (+test), `main.tsx`. `npm test` → **165 passed** (22 files); `tsc -p web` clean; `npm run build` OK.
  (Built by a background agent that hit its session limit after writing the code/tests but before the
  build-log entry — entry added by the reviewer.)
- **Verdict:** ✅ **Approve — no blockers.**

### Solid
- **Contract exact (review R3):** `importFile` POSTs `multipart/form-data` (`file`/`table`/optional
  `format`) with **no manual Content-Type** (browser sets the boundary), throws `ApiError` reading the
  backend `{ error }` on non-ok. `ImportResult` mirrors `{ table, format, rowsWritten?, queryId }`.
  `IMPORT_FORMATS` whitelist mirrors the backend.
- **DL-020:** `useImportFile` is a `useMutation` that **invalidates nothing** — correct: import inserts
  into an existing table, no cached list/schema changes. Drives pending/disabled + toasts.
- **DL-006/026/028:** `fileImportPlugin` (`placement:'left'` — a "source" action), `icon:'upload'`,
  same `renderPanel`+hook-in-child pattern as the other plugins.
- **DL-017:** Click UI `FileUpload`/`Select`/`TextField`/`Button` throughout; `tsc -p web` clean is
  strong evidence the props are valid. Thoughtful catch: widening `FileUpload`'s `supportedFileTypes`
  so it doesn't reject CSV/TSV/JSON.
- **DL-027:** success toast (`Imported N rows into <table>`, singular/plural) + error toast (surfaces
  the backend message); re-checks inputs at click (avoids the saveQuery stale-enable issue).
- **Tests substantive:** API (FormData fields, format omitted, ApiError) + plugin (disabled until
  file+table, then POSTs FormData) — the riskiest paths covered.

### NOTE (non-blocking)
- File-size/type are not pre-validated client-side; the backend enforces the 50 MB cap (413) and
  format, surfaced via the error toast. Fine — server is the source of truth.
- **Single open-panel state.** `App` tracks one `openPluginId`; fine while every plugin is left-placed,
  but when a right-placement plugin lands (the DL-026 seam) you'll want independent left/right open
  state so a source + a detail can show together.

---

## Review R12 — import-creates-table + readable errors/toasts (was DL-031/032 → renumbered DL-033/034)

- **Date:** 2026-06-21
- **Reviewed:** uncommitted FE/BE track — `formatError.ts` (+test), `useToast.ts`, `StatementResultCard`,
  `ResultsPanel`, `fileImportPlugin`/`api/import`/`routes/import` (create-table), `schema`. `npm test`
  → **186 passed** (23 files); web typecheck clean.
- **Verdict:** ✅ **Approve.** One BLOCKER found **and fixed by the reviewer** (decision-log collision).

### 🔴 BLOCKER-1 — decision-log numbering collision (RESOLVED here)
- This track appended **DL-031** (import creates table) and **DL-032** (readable errors/toasts) to the
  append-only log — but those numbers were **already committed** for the AI assistant (DL-031 proxy,
  DL-032 Gemini, commit `6e66286`). The working `DECISION_LOG.md` had duplicate DL-031/DL-032, and
  code comments cited the wrong numbers.
- **Fix applied:** renumbered this (later, uncommitted) track → **DL-033** (import creates table) and
  **DL-034** (errors/toasts), and updated every code-comment reference (`fileImportPlugin`,
  `useImportFile`, `api/import`, `routes/import`, `styles.css`, `StatementResultCard`, `useToast`,
  `formatError`). Verified: each DL number now appears once; AI DL-031/032 untouched.
- **Process note:** classic two-agents-one-tree hazard. Coordinate the next free DL number before logging.

### Solid
- **DL-033 (import creates table):** table name validated by the identifier regex **before** the
  `CREATE TABLE` DDL runs, and column identifiers are backtick-quoted/escaped — **not** a DDL-injection
  surface. All-`Nullable(String)` columns are a deliberate, dependency-free MVP (logged); `IF NOT
  EXISTS` is idempotent; `useImportFile` invalidates the schema query so a new table appears. Creatable
  Click UI `Select` for existing-or-new target. Covered by `inferColumnNames` + route tests.
- **DL-034 (readable errors/toasts):** `formatClickHouseError` is pure/defensive (strips echoed SQL +
  version tag, normalises whitespace, safe on non-string); applied on card + banner + import toast;
  error height capped + scrollable; toasts colour-coded via Click UI alert tokens. `formatError` unit-tested.

### NOTE (non-blocking)
- Toast colouring depends on Click UI's internal `cui-toast` class names + forwarded `className` —
  brittle to a Click UI internals change. Acceptable (token-based, no `!important`); revisit if a CU
  upgrade changes the markup.

---

## Review R13 — DL-024 nice-to-haves (results search/sort + saved-query rename) + toast opacity

- **Date:** 2026-06-21
- **Reviewed:** `ResultTable.tsx` (search + sort), `api/savedQueries.ts` (`updateSavedQuery`),
  `useSavedQueries.ts` (`useUpdateSavedQuery`), `saveQueryPlugin.tsx` (inline rename) + tests; plus a
  reviewer toast-opacity fix in `styles.css`. `npm test` → **218 passed** (29 files); `npm run
  typecheck` → clean (both projects).
- **Verdict:** ✅ **Approve.**

### Solid (DL-024)
- **Result search** — case-insensitive substring over the **rendered** cell text (same `formatCell`
  as the grid), filters the already server-capped rows client-side; "No matching rows" empty state.
- **Column sort** — tri-state asc → desc → none via the Click UI `Table`'s `onSort`/`sortDir`/
  `isSortable` (DL-017, reuses the built-in caret); **stable** (original-index tiebreaker), numeric
  compare when both cells parse as finite numbers else `localeCompare`; composes with search.
- **Saved-query rename** — per-row pencil → inline `TextField` (Enter confirm / Esc cancel, disabled
  on empty/unchanged) → `useUpdateSavedQuery` → `PUT /api/queries/:id` → `invalidateQueries`; toasts
  success/error (backend PUT already existed). Pure components + local display state; no over-engineering.

### Reviewer fix — toast opacity (user request)
- The DL-034 toast tints used `--click-alert-color-background-*`, which are **semi-transparent**
  (`rgb(… / 0.1–0.2)`) → see-through toasts. Fixed by **compositing**: opaque
  `background-color: var(--click-global-color-background-default)` base + the tint as a solid
  `background-image` gradient on top → **fully opaque, still tinted, still theme-aware**.

### NOTE (non-blocking)
- Sort runs on the **displayed (capped) rows**, not the full server result — correct for a
  client-side feature on a 1000-row cap (DL-009); a truncated result sorts only what's shown.

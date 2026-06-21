# Spike — Buy vs Build

**Question:** For each non-trivial capability of the SQL editor, do we *buy* (adopt a
third-party library) or *build* (write it ourselves)? Optimize for the evaluation criteria:
architecture, readability/maintainability, component & state design, async/error/loading
handling, UX, and trade-off thoughtfulness.

**Outcome:** Buy the design system, the editor, and the splitter; build the thin
domain-specific glue (classification, state machine, plugin seam). Decisions are recorded
in `DECISION_LOG.md` (DL-001 … DL-003, DL-009).

Versions/sizes below were gathered during the spike (mid-2026); treat as point-in-time.

---

## 1. Component library — **BUY: Click UI** (DL-001)

| | Pros | Cons |
|---|---|---|
| **Buy `@clickhouse/click-ui`** | First-party ClickHouse design system; Table, Button, Select, Dialog, Tabs, Accordion, Toast, Alert, FileInput out of the box; Apache-2.0; on-brand for the assignment | Peer deps (`styled-components@6`, `dayjs`, `react@^18.3`); requires `<ClickUIProvider>` (styles via import graph — no manual CSS import on v0.6.1); **no editor component** |
| Build custom CSS | Zero deps, full control | Reinventing primitives; slower; less polished |

**Decision:** Buy. Key finding: **Click UI ships no interactive editor** (its `CodeBlock`
is read-only syntax highlighting), which forces a separate editor decision (§2).
Click UI bundles `react-window`, so virtualization is available later if needed.

---

## 2. SQL editor — **BUY: CodeMirror 6** (DL-002)

| Option | Type | Weight | ClickHouse | Notes |
|---|---|---|---|---|
| **`@uiw/react-codemirror` + `@codemirror/lang-sql`** | Buy | ~29 kB gz | Generic SQL now; custom dialect later | MIT, active; **extension system = our plugin model**; schema autocomplete |
| `@monaco-editor/react` (Monaco) | Buy | ~500 kB gz | Via `@popsql/monaco-sql-languages` | VS Code engine; needs Vite web-worker setup; overkill |
| `<textarea>` | Build | 0 | n/a | No highlighting/line numbers; weakest UX; we'd reimplement plugin hooks |

**Decision:** Buy CodeMirror 6. It scores directly on **UX/usability** (highlighting, line
numbers, keymaps) and its extension system maps onto the **"addons as editor plugins"**
requirement (DL-006). `@codemirror/lang-sql` has no native ClickHouse dialect — generic SQL
works today; a custom `SQLDialect.define(...)` is a small, isolated later enhancement.
Monaco is ~10x heavier for features (LSP, refactoring) we don't need.

---

## 3. Multi-statement splitter — **BUY: `dbgate-query-splitter`** (DL-003)

| Option | Type | Notes |
|---|---|---|
| **`dbgate-query-splitter`** | Buy | MIT, zero-dependency, maintained; handles comments/strings/delimiters; **no certified ClickHouse dialect** → must test edge cases |
| Hand-rolled tokenizer (~80 lines) | Build | ClickHouse-correct, zero dep, full control; but reinvents a solved problem |
| `node-sql-parser` | Buy | Full AST (~500 kB); overkill for splitting; no ClickHouse dialect |

**Decision (user):** Buy `dbgate-query-splitter`, run on the **backend**. Mitigation: pick
the closest options preset and **unit-test ClickHouse edge cases** (`''` quote-escaping,
backtick identifiers, `--` / `/* */` comments, `;` inside strings); fall back to a custom
options object if needed (would be logged as a new decision).

---

## 4. Results grid — **BUY (reuse Click UI Table) + server-side cap** (DL-009)

| Option | Weight (gz) | Virtualization | Fit |
|---|---|---|---|
| **Click UI Table** | ~20 kB (incl. react-window) | yes (react-window) | Cohesive with design system; good ≤ ~10k rows |
| `react-window` | ~5 kB | row | Bare-bones, if we outgrow Click UI Table |
| `@tanstack/react-table` | ~15 kB | headless | Max control for wide/complex grids |
| `ag-grid` | ~200 kB | advanced | Overkill |

**Decision:** Reuse the Click UI Table and **cap rows server-side** (default 1000,
`truncated` flag + UI notice). Defer dedicated virtualization until a real need appears
(avoids over-engineering; clean extension point remains).

---

## 5. What we deliberately **build**

These are thin, domain-specific, and not worth a dependency:

- **Statement classifier** (`query` vs `command` by leading keyword) — small, ClickHouse-aware.
- **Async state machine** (`useRunQuery`, discriminated union + `AbortController`) — core to
  the async/loading/error criterion; a library would obscure it.
- **Plugin seam** (`EditorPlugin`/`PluginRegistry`) — intentionally minimal (DL-006); the
  point is a clean extension contract, not a framework.
- **Typed API client + service layer** — small, testable, dependency-injected.

---

## Bottom line

Buy the heavy, well-solved pieces (design system, editor, splitter, grid); build the small
domain glue that demonstrates the architecture and async/error handling we're evaluated on.
Total added runtime weight is modest (design system + ~29 kB editor + a tiny splitter), and
every choice is reversible behind a thin abstraction.

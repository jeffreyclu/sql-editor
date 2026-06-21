# Import sample files

Drop-in files for exercising the **Import** plugin (`POST /import`). The importer streams a file
into an **existing** ClickHouse table — it does not create tables or infer a schema — so:

1. Run [`setup.sql`](./setup.sql) once in the editor to create the target tables
   (`events`, `products`, `measurements`, `notes`).
2. Open **Import**, pick a file below, type its **table**, choose its **Format**, click **Import**.

MergeTree appends on every import, so re-importing duplicates rows. `TRUNCATE TABLE <name>;`
between runs to start clean.

## Happy path — same `events` rows in every supported format

Each of these loads the identical 8 rows into **`events`**; use them to confirm every format works.

| File | Table | Format | Notes |
|------|-------|--------|-------|
| `events.csv` | `events` | `CSVWithNames` | Header row + 8 data rows. The default format. |
| `events_no_header.csv` | `events` | `CSV` | Same rows, **no header** — column order is positional. |
| `events.tsv` | `events` | `TabSeparatedWithNames` | Tab-delimited with a header. |
| `events_no_header.tsv` | `events` | `TabSeparated` | Tab-delimited, no header. |
| `events.ndjson` | `events` | `JSONEachRow` | One JSON object per line. |

Verify with `SELECT * FROM events ORDER BY id;` — all five produce the same 8 rows.

## Edge cases (still valid — these should succeed)

| File | Table | Format | What it stresses |
|------|-------|--------|------------------|
| `products_tricky.csv` | `products` | `CSVWithNames` | Quoted commas, a field that **spans two lines**, escaped `""` quotes, unicode/emoji (`Café ☕ 日本語 🚀`), preserved padding, an empty string. |
| `measurements_nulls.csv` | `measurements` | `CSVWithNames` | `\N` → NULL (CSV null literal), an all-NULL row, negatives, scientific notation (`1.5e10`), and max `Int64`. |
| `notes.ndjson` | `notes` | `JSONEachRow` | Unicode + `\n`/`\t`/`\"` escapes, `null` score, **keys in any order**, and a row that **omits** `score` (→ NULL). |
| `header_only.csv` | `events` | `CSVWithNames` | Header but **zero data rows** → a successful import of 0 rows. |
| `big_events.csv` | `events` | `CSVWithNames` | **20,000 rows** (~0.8 MB) — a non-trivial upload, still well under the 50 MB cap. |

## Failure path (these should return a `400` and an error toast)

| File | Table | Format | Why it fails |
|------|-------|--------|--------------|
| `events_bad_types.csv` | `events` | `CSVWithNames` | `"not_a_number"` in a `UInt32`, `"oops"` in a `Float64`, a non-parseable `DateTime`. |
| `events_ragged.csv` | `events` | `CSVWithNames` | Rows with too few and too many columns. |
| `notes_json_array.json` | `notes` | `JSONEachRow` | A top-level JSON **array** — `JSONEachRow` wants one object per line. (Picking the wrong format.) |
| `empty.csv` | `events` | `CSVWithNames` | A 0-byte file — no header to parse. |
| any file | `no such table` | any | Unknown target table → `400` from ClickHouse, surfaced verbatim. |

### Other things worth poking at by hand

- **Wrong format on a good file:** import `events.ndjson` as `CSV`, or `events.csv` as `JSONEachRow`.
- **Invalid table name:** type `my-table` (the hyphen fails the `^[A-Za-z_]\w*(\.\w+)?$` check → `400`).
- **Database-qualified table:** the name field accepts `default.events`.
- **413 (too large):** the cap is 50 MB and isn't worth committing a file for — generate one locally,
  e.g. `yes "1,2024-01-15 09:30:00,click,3.14,1" | head -2000000 > /tmp/huge.csv`, then import as `CSV`.

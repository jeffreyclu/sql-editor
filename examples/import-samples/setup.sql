-- Run this FIRST, in the editor, before importing any of the sample files.
-- The import feature inserts into an EXISTING table — it does not create one or infer a schema.
-- Each CREATE here matches one or more sample files (see README.md for the file → table mapping).
--
-- MergeTree appends on every import, so re-importing the same file duplicates rows. To start
-- clean, run `TRUNCATE TABLE <name>` (or DROP + re-create) between runs.

-- events — clean demo table shared by the CSV / TSV / NDJSON format-coverage samples.
CREATE TABLE IF NOT EXISTS events (
    id    UInt32,
    ts    DateTime,
    kind  String,
    value Float64,
    ok    UInt8
) ENGINE = MergeTree ORDER BY id;

-- products — string edge cases: commas, embedded newlines, escaped quotes, unicode/emoji.
CREATE TABLE IF NOT EXISTS products (
    id          UInt32,
    name        String,
    description String,
    price       Decimal(10, 2),
    tags        String
) ENGINE = MergeTree ORDER BY id;

-- measurements — NULL handling and numeric edge cases (every value column is Nullable).
-- CSV represents NULL as the literal \N (ClickHouse's format_csv_null_representation default).
CREATE TABLE IF NOT EXISTS measurements (
    id          UInt32,
    label       Nullable(String),
    reading     Nullable(Float64),
    count       Nullable(Int64),
    recorded_at Nullable(DateTime)
) ENGINE = MergeTree ORDER BY id;

-- notes — JSONEachRow edge cases: unicode, escaped chars, null, key reordering, omitted field.
CREATE TABLE IF NOT EXISTS notes (
    id     UInt32,
    author String,
    body   String,
    score  Nullable(Int32)
) ENGINE = MergeTree ORDER BY id;

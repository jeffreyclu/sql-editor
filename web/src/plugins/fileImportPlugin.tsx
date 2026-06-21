import { useMemo, useState } from 'react';
import { Button, Container, FileUpload, Select, Text } from '@clickhouse/click-ui';
import type { EditorPlugin } from './types';
import { IMPORT_FORMATS, formatForFileName, type ImportFormat } from '../api/import';
import { formatClickHouseError } from '../api/formatError';
import { qualifiedTableNames } from '../api/schema';
import { useImportFile } from '../hooks/useImportFile';
import { useSchema } from '../hooks/useSchema';
import { useToast } from '../hooks/useToast';

// The File import plugin (DL-006): the frontend half of `POST /import`. Pick a file, choose the
// target table, and stream it into an existing ClickHouse table via a TanStack mutation (DL-020).
// The table is a dropdown sourced from the cached schema (`useSchema`, DL-025) — import only ever
// targets a table that already exists, so the schema is the right source instead of free text.
// The format pre-selects from the file's extension (`formatForFileName`) and stays editable, since
// the extension can't reveal whether a CSV/TSV has a header. Placement is `'left'` — it's a
// "source" action like Examples/History/Saved (DL-026/DL-028). The hook lives in a child component
// so it isn't called conditionally from PluginPanel (the same hook-safety pattern as the others).
export const fileImportPlugin: EditorPlugin = {
  id: 'import',
  toolbarLabel: 'Import',
  icon: 'upload',
  title: 'Import data',
  placement: 'left',
  renderPanel: () => <ImportPanel />,
};

const DEFAULT_FORMAT: ImportFormat = 'CSVWithNames';

// Extensions the import formats commonly use. Click UI's FileUpload validates the picked file's
// extension against this list (defaulting to `.txt`/`.sql`, which would reject a CSV), so we
// widen it to the formats we accept. The backend's `format` field is the real source of truth.
const SUPPORTED_FILE_TYPES = ['.csv', '.tsv', '.tab', '.txt', '.json', '.ndjson'];

function ImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState('');
  const [format, setFormat] = useState<ImportFormat>(DEFAULT_FORMAT);
  // Click UI's FileUpload is uncontrolled (it owns the selected-file state internally), so the only
  // way to clear it from here is to remount it. We bump this key after a successful import to reset
  // the upload area to its empty state — otherwise it lingers showing the just-imported file.
  const [uploadKey, setUploadKey] = useState(0);
  const importFile = useImportFile();
  const toast = useToast();
  const schema = useSchema();

  const tables = useMemo(() => qualifiedTableNames(schema.data ?? []), [schema.data]);
  // A typed name that isn't an existing table → create it on import (DL-033).
  const isNewTable = table.length > 0 && !tables.includes(table);
  const canImport = file !== null && table.length > 0 && !importFile.isPending;

  const handleFileSelect = (selected: File) => {
    setFile(selected);
    // Clear any prior failure/success so a freshly picked file doesn't inherit the last attempt's
    // error styling (FileUpload shows red whenever it isn't in a success/progress state).
    importFile.reset();
    // Pre-select a sensible format from the extension; the user can still override it below.
    const derived = formatForFileName(selected.name);
    if (derived) {
      setFormat(derived);
    }
  };

  const handleImport = () => {
    // Re-check at click time — the disabled state is a best-effort render guard (cf. saveQuery).
    if (!file || table.length === 0 || importFile.isPending) {
      return;
    }
    importFile.mutate(
      { file, table, format, createTable: isNewTable },
      {
        onSuccess: (result) => {
          const rows = typeof result.rowsWritten === 'number' ? result.rowsWritten : 0;
          const target = result.created ? `new table ${result.table}` : result.table;
          toast.success(`Imported ${rows} ${rows === 1 ? 'row' : 'rows'} into ${target}`);
          // Reset the upload area for the next import (remount + clear our file); keep table/format.
          setFile(null);
          setUploadKey((key) => key + 1);
        },
        onError: (error) =>
          toast.error(formatClickHouseError(error instanceof Error ? error.message : 'Import failed')),
      },
    );
  };

  const failureMessage =
    importFile.error instanceof Error ? importFile.error.message : 'Import failed';

  return (
    <Container orientation="vertical" gap="lg" fillWidth>
      {/* Click UI Container wrapper (DL-017) so styles.css can shrink the FileUpload's
          "Files supported: …" line (FileUploadDescription) below the title — the component
          exposes no prop for it. */}
      <Container className="file-import__upload" fillWidth>
        <FileUpload
          key={uploadKey}
          title="Drop a file or browse"
          size="md"
          supportedFileTypes={SUPPORTED_FILE_TYPES}
          // A selected file reads as "ready" (no red) until an import actually fails; on failure the
          // component shows its error state with a Retry that re-runs the import.
          showSuccess={file !== null && !importFile.isError}
          failureMessage={failureMessage}
          onRetry={handleImport}
          onFileSelect={handleFileSelect}
          onFileClose={() => {
            setFile(null);
            importFile.reset();
          }}
        />
      </Container>

      <Container orientation="vertical" gap="xs" fillWidth>
        <Text size="sm" color="muted">
          Table
        </Text>
        <TableSelect
          isPending={schema.isPending}
          isError={schema.isError}
          tables={tables}
          value={table}
          isNew={isNewTable}
          onSelect={setTable}
        />
      </Container>

      <Container orientation="vertical" gap="xs" fillWidth>
        <Text size="sm" color="muted">
          Format
        </Text>
        <Select value={format} onSelect={(value) => setFormat(value as ImportFormat)}>
          {IMPORT_FORMATS.map((option) => (
            <Select.Item key={option} value={option}>
              {option}
            </Select.Item>
          ))}
        </Select>
      </Container>

      <Button
        label={importFile.isPending ? 'Importing…' : 'Import'}
        iconLeft="upload"
        loading={importFile.isPending}
        disabled={!canImport}
        onClick={handleImport}
      />
    </Container>
  );
}

interface TableSelectProps {
  isPending: boolean;
  isError: boolean;
  tables: string[];
  value: string;
  /** The chosen value is a not-yet-existing table that import will create (DL-033). */
  isNew: boolean;
  onSelect: (table: string) => void;
}

// The target-table picker: a searchable dropdown of existing tables that also lets the user type a
// new name to create one on import (`allowCreateOption`, DL-033). It stays usable even if the schema
// fails to load — you can always type a name — so import is never blocked by a stale/failed schema.
function TableSelect({ isPending, isError, tables, value, isNew, onSelect }: TableSelectProps) {
  return (
    <Container orientation="vertical" gap="xs" fillWidth>
      <Select
        // Click UI treats an empty-string value as a (blank) selection, which hides the placeholder;
        // pass undefined when nothing is chosen so the placeholder shows.
        value={value || undefined}
        onSelect={onSelect}
        placeholder={isPending ? 'Loading tables…' : 'Select or type a new table'}
        disabled={isPending}
        showSearch
        allowCreateOption
        customText="Create new table"
      >
        {tables.map((name) => (
          <Select.Item key={name} value={name}>
            {name}
          </Select.Item>
        ))}
      </Select>
      {isError && (
        <Text size="sm" color="muted">
          Couldn’t load existing tables — you can still type a name to create one.
        </Text>
      )}
      {isNew && (
        <Text size="sm" color="muted">
          New table — columns are created as String from the file’s header.
        </Text>
      )}
    </Container>
  );
}

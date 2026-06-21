import { useState } from 'react';
import { Button, Container, FileUpload, Select, Text, TextField } from '@clickhouse/click-ui';
import type { EditorPlugin } from './types';
import { IMPORT_FORMATS, type ImportFormat } from '../api/import';
import { useImportFile } from '../hooks/useImportFile';
import { useToast } from '../hooks/useToast';

// The File import plugin (DL-006): the frontend half of `POST /import`. Pick a file, name the
// target table, choose a format, and stream it into an existing ClickHouse table via a TanStack
// mutation (DL-020). Placement is `'left'` — it's a "source" action like Examples/History/Saved
// (DL-026/DL-028). The hook lives in a child component so it isn't called conditionally from
// PluginPanel (the same hook-safety pattern as History/Saved/Schema).
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
  const importFile = useImportFile();
  const toast = useToast();

  const trimmedTable = table.trim();
  const canImport = file !== null && trimmedTable.length > 0 && !importFile.isPending;

  const handleImport = () => {
    // Re-check at click time — the disabled state is a best-effort render guard (cf. saveQuery).
    if (!file || trimmedTable.length === 0 || importFile.isPending) {
      return;
    }
    importFile.mutate(
      { file, table: trimmedTable, format },
      {
        onSuccess: (result) => {
          const rows = typeof result.rowsWritten === 'number' ? result.rowsWritten : 0;
          toast.success(`Imported ${rows} ${rows === 1 ? 'row' : 'rows'} into ${result.table}`);
          // Reset the file so the panel is ready for the next import; keep table/format.
          setFile(null);
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : 'Import failed'),
      },
    );
  };

  return (
    <Container orientation="vertical" gap="lg" fillWidth>
      <FileUpload
        title="Drop a file or browse"
        supportedFileTypes={SUPPORTED_FILE_TYPES}
        showSuccess={file !== null}
        onFileSelect={(selected) => setFile(selected)}
        onFileClose={() => setFile(null)}
      />

      <Container orientation="vertical" gap="xs" fillWidth>
        <Text size="sm" color="muted">
          Table
        </Text>
        <TextField
          value={table}
          onChange={(value) => setTable(value)}
          placeholder="Existing table (e.g. events or db.events)"
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

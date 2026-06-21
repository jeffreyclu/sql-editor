import type { ResultAction } from './types';
import { downloadCsv, statementResultToCsv } from '../services/csv';

// Result-pane plugin (DL-006/DL-024): export a data-returning statement's result as CSV. Self-
// contained — the results pane knows nothing about CSV; it just renders this registered action.
export const csvExportPlugin: ResultAction = {
  id: 'export-csv',
  label: 'Export CSV',
  icon: 'download',
  isAvailable: (result) =>
    result.status === 'success' && result.kind === 'query' && (result.rows?.length ?? 0) > 0,
  run: (result, index) => downloadCsv(`query-result-${index + 1}.csv`, statementResultToCsv(result)),
};

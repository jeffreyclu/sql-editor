import type { StatementResult } from '../api/types';

// Serialize a data-returning statement's result to RFC 4180 CSV (DL-024 export action). Pure and
// framework-agnostic so it's unit-testable (DL-015); the browser download lives in `downloadCsv`.
export function statementResultToCsv(result: StatementResult): string {
  const columns = result.columns ?? [];
  const rows = result.rows ?? [];
  const header = columns.map((column) => escapeField(column.name)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeField(formatValue(row[column.name]))).join(','),
  );
  return [header, ...body].join('\r\n');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  // ClickHouse array/tuple/nested values arrive as objects — serialize them as JSON.
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

// Quote per RFC 4180 when the field contains a comma, double-quote, CR or LF; escape embedded quotes.
function escapeField(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// Trigger a browser download of the CSV. The leading UTF-8 BOM stops Excel mangling non-ASCII.
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

import { criterionOf } from './criteria.js';
import type { AuditReport } from './report.js';
import { CHECK_SC } from './types.js';

/**
 * A report as comma-separated values, one row per finding, for a spreadsheet
 * or a bug tracker import. Cells follow RFC 4180: a cell with a comma, a quote
 * or a line break is wrapped in quotes and its quotes are doubled. A cell that
 * a spreadsheet would run as a formula (it starts with =, +, - or @) gets a
 * leading apostrophe, because page text ends up in these cells and must never
 * be executed. Both languages are written, so one file serves both teams.
 */

export const CSV_COLUMNS: readonly string[] = ['route', 'viewport', 'check', 'criterion', 'level', 'rule', 'status', 'element', 'message_en', 'message_fr'];

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell, guarded against formula injection and quoted when it needs to be. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function csvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

/** The findings of a report as CSV with a header row. Lines end in CR LF, as the format asks. */
export function renderCsv(report: AuditReport): string {
  const lines: string[] = [csvRow(CSV_COLUMNS)];
  for (const route of report.routes) {
    for (const e of route.entries) {
      const raw = (CHECK_SC as Readonly<Record<string, string | null | undefined>>)[e.check];
      const sc = typeof raw === 'string' ? raw : '';
      lines.push(
        csvRow([route.route, route.viewportWidth, e.check, sc, sc ? (criterionOf(sc)?.level ?? '') : '', e.rule ?? '', e.status, e.id, e.message.en, e.message.fr]),
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Reads CSV text back into rows of cells. It understands quoted cells, doubled
 * quotes, and line breaks inside quotes, and accepts LF as well as CR LF. It
 * does not undo the formula guard: the apostrophe stays, as it would in a
 * spreadsheet.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const endRow = (): void => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = '';
  };
  while (i < text.length) {
    const c = text[i] ?? '';
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else cell += c;
      i++;
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      endRow();
      i++;
    } else if (c === '\n') endRow();
    else cell += c;
    i++;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

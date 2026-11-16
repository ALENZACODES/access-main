/** CSV export of the audited source list (RFC 4180, with a spreadsheet formula guard). */
import type { AuditedSource } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { t } from './i18n';

const FORMULA_START = /^[=+\-@\t\r]/;

/** Quote when needed; neutralise cells a spreadsheet would run as formulas. */
export function csvCell(value: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(rows: readonly (readonly string[])[], bom = false): string {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return bom ? `\uFEFF${body}` : body;
}

export function auditedSourcesToCsv(sources: readonly AuditedSource[], locale: Locale, bom = true): string {
  const unknown = t(locale, 'unknown');
  const header = [
    t(locale, 'csv.dataset'),
    t(locale, 'csv.source'),
    t(locale, 'csv.url'),
    t(locale, 'csv.licence'),
    t(locale, 'csv.openLicence'),
    t(locale, 'csv.retrieved'),
    t(locale, 'csv.status'),
  ];
  const open = (v: boolean | null) => (v === null ? unknown : v ? t(locale, 'cov.yes') : t(locale, 'cov.no'));
  const rows = sources.map((s) => [
    s.datasetName,
    s.name ?? unknown,
    s.url ?? '',
    s.licence ?? unknown,
    open(s.licenceOpen),
    s.retrievedIso ?? unknown,
    t(locale, `state.${s.state}`),
  ]);
  return toCsv([header, ...rows], bom);
}

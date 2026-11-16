/**
 * Downloadable files for the on-device data-status page. The same builders as
 * the server routes (CSV, credits, summary, calendar, catalogue), so a file
 * saved from the page matches the one the route serves for the same records.
 */
import { buildAttributions, renderAttributionText } from './attribution';
import { buildCatalogue, catalogueToJson } from './catalogue';
import { auditedSourcesToCsv } from './csv';
import type { Locale } from './dataStatus';
import { auditRegistry, type DatasetRecord } from './datasetRegistry';
import { t, type MessageKey } from './i18n';
import { buildIcs } from './ics';
import { buildReviewQueue } from './reviewDue';
import { buildSummary, summaryToJson } from './summary';
import type { Thresholds } from './thresholds';

export type ExportId = 'csv' | 'credits' | 'summary' | 'ics' | 'catalogue';

export interface ExportFile {
  id: ExportId;
  filename: string;
  mime: string;
  label: string;
  text: string;
}

const LABELS: Readonly<Record<ExportId, MessageKey>> = {
  csv: 'act.exportCsv',
  credits: 'dl.credits',
  summary: 'dl.summary',
  ics: 'dl.ics',
  catalogue: 'dl.catalogue',
};

export const EXPORT_IDS: readonly ExportId[] = ['csv', 'credits', 'summary', 'ics', 'catalogue'];

export function buildExportFiles(
  records: readonly DatasetRecord[],
  locale: Locale,
  now: Date,
  thresholds: Thresholds = {},
): ExportFile[] {
  const audit = auditRegistry(records, now, thresholds);
  const label = (id: ExportId) => t(locale, LABELS[id]);
  return [
    { id: 'csv', filename: 'data-sources.csv', mime: 'text/csv;charset=utf-8', label: label('csv'), text: auditedSourcesToCsv(audit.sources, locale) },
    {
      id: 'credits',
      filename: 'credits.txt',
      mime: 'text/plain;charset=utf-8',
      label: label('credits'),
      text: `${renderAttributionText(buildAttributions(audit.sources, locale), locale)}\n`,
    },
    { id: 'summary', filename: 'summary.json', mime: 'application/json;charset=utf-8', label: label('summary'), text: summaryToJson(buildSummary(audit, now)) },
    { id: 'ics', filename: 'review-dates.ics', mime: 'text/calendar;charset=utf-8', label: label('ics'), text: buildIcs(buildReviewQueue(audit, now), now, locale) },
    { id: 'catalogue', filename: 'catalogue.json', mime: 'application/ld+json;charset=utf-8', label: label('catalogue'), text: catalogueToJson(buildCatalogue(audit, now)) },
  ];
}

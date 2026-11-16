/** Localized data-quality report built from a registry audit. */
import type { AuditResult, FindingCode } from './datasetRegistry';
import { findingRank } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { escapeHtml } from './sourceList';
import { t, type MessageKey } from './i18n';

export interface QaItem {
  code: FindingCode;
  datasetId: string;
  sourceId: string | null;
  text: string;
}

export interface QaCount {
  key: MessageKey;
  label: string;
  value: number;
}

export interface QaReport {
  counts: QaCount[];
  items: QaItem[];
}

export function buildQaReport(audit: AuditResult, locale: Locale): QaReport {
  const tot = audit.totals;
  const c = (key: MessageKey, value: number): QaCount => ({ key, label: t(locale, key), value });
  const items = audit.findings.map((f): QaItem => {
    const name = f.sourceId === null ? f.datasetName : `${f.datasetName} / ${f.sourceId}`;
    return {
      code: f.code,
      datasetId: f.datasetId,
      sourceId: f.sourceId,
      text: t(locale, `issue.${f.code}`, { name }),
    };
  });
  return {
    counts: [
      c('qa.counts.datasets', tot.datasets),
      c('qa.counts.sources', tot.sources),
      c('qa.counts.stale', tot.stale),
      c('qa.counts.unknownDate', tot.unknownDate),
      c('qa.counts.notOpen', tot.notOpen),
      c('qa.counts.missing', tot.missingDetails),
      c('qa.counts.duplicates', tot.duplicates),
    ],
    items,
  };
}

/** Items needing the most attention come first (see findingRank). */
export function isPriority(code: FindingCode): boolean {
  return findingRank(code) === 0;
}

export function renderQaReportHtml(report: QaReport, locale: Locale): string {
  const counts = report.counts
    .map((x) => `<div><dt>${escapeHtml(x.label)}</dt><dd>${x.value}</dd></div>`)
    .join('');
  const list =
    report.items.length === 0
      ? `<p>${escapeHtml(t(locale, 'qa.noItems'))}</p>`
      : `<ul>${report.items.map((i) => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>`;
  return (
    `<section aria-labelledby="ds-qa-title"><h2 id="ds-qa-title">${escapeHtml(t(locale, 'qa.title'))}</h2>` +
    `<dl>${counts}</dl><h3>${escapeHtml(t(locale, 'qa.itemsHeading'))}</h3>${list}</section>`
  );
}

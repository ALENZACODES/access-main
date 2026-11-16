/**
 * UNKNOWN rates per field, across all sources and per dataset.
 *
 * A field is "known" only when the audit holds a usable value for it. Missing, unreadable,
 * future-dated and placeholder values (see unknownTokens.ts) are all "unknown". Unknown is
 * counted on its own: it is never folded into "No" and never guessed from another field.
 * With nothing to measure the rate is null, not 0.
 */
import type { AuditedSource, AuditResult } from './datasetRegistry';
import { formatRate, type Locale, type RateDisplay } from './dataStatus';
import { escapeHtml } from './sourceList';
import { t, type MessageKey } from './i18n';

export const COMPLETENESS_FIELDS = ['name', 'url', 'source', 'licence', 'licenceStatus', 'retrieved'] as const;
export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number];

export interface FieldRate {
  field: CompletenessField;
  known: number;
  unknown: number;
  total: number;
  /** Percentage of sources whose value is unknown; null when there are no sources. */
  unknownPercent: number | null;
}

export interface DatasetCompleteness {
  datasetId: string;
  datasetName: string;
  total: number;
  fields: FieldRate[];
}

export interface Completeness {
  total: number;
  fields: FieldRate[];
  datasets: DatasetCompleteness[];
}

/** Whether the audit holds a usable value for the field. */
export function isFieldKnown(s: AuditedSource, field: CompletenessField): boolean {
  switch (field) {
    case 'name':
      return s.name !== null;
    case 'url':
      return s.url !== null;
    case 'source':
      return !s.issues.includes('missing-source');
    case 'licence':
      return s.licence !== null;
    case 'licenceStatus':
      return s.licenceOpen !== null;
    case 'retrieved':
      // A future date is on record but not usable, so it counts as unknown.
      return s.ageDays !== null;
  }
}

function rates(sources: readonly AuditedSource[]): FieldRate[] {
  return COMPLETENESS_FIELDS.map((field) => {
    let known = 0;
    for (const s of sources) if (isFieldKnown(s, field)) known++;
    const total = sources.length;
    return { field, known, unknown: total - known, total, unknownPercent: total === 0 ? null : ((total - known) / total) * 100 };
  });
}

export function buildCompleteness(audit: AuditResult): Completeness {
  const byDataset = new Map<string, AuditedSource[]>();
  for (const s of audit.sources) {
    const list = byDataset.get(s.datasetId);
    if (list) list.push(s);
    else byDataset.set(s.datasetId, [s]);
  }
  return {
    total: audit.sources.length,
    fields: rates(audit.sources),
    // Datasets that share an id (reported as duplicates) cannot be told apart, so they form one entry.
    datasets: audit.datasets
      .filter((d, i) => audit.datasets.findIndex((x) => x.id === d.id) === i)
      .map((d) => {
        const own = byDataset.get(d.id) ?? [];
        return { datasetId: d.id, datasetName: d.name, total: own.length, fields: rates(own) };
      }),
  };
}

/** Problems with a Completeness value; empty when its numbers add up. */
export function completenessProblems(c: Completeness): string[] {
  const out: string[] = [];
  const check = (label: string, f: FieldRate, total: number) => {
    if (f.total !== total) out.push(`${label}.${f.field}: total ${f.total} != ${total}`);
    if (f.known + f.unknown !== f.total) out.push(`${label}.${f.field}: known + unknown != total`);
    if (f.known < 0 || f.unknown < 0) out.push(`${label}.${f.field}: negative count`);
    const want = f.total === 0 ? null : (f.unknown / f.total) * 100;
    if (f.unknownPercent !== want) out.push(`${label}.${f.field}: unknownPercent`);
  };
  for (const f of c.fields) check('all', f, c.total);
  if (c.fields.length !== COMPLETENESS_FIELDS.length) out.push('all: field count');
  let sum = 0;
  for (const d of c.datasets) {
    sum += d.total;
    for (const f of d.fields) check(d.datasetId, f, d.total);
  }
  if (sum !== c.total) out.push('datasets do not add up to the overall total');
  return out;
}

export interface CompletenessRow {
  field: CompletenessField;
  label: string;
  known: number;
  unknown: number;
  share: RateDisplay;
}

export function completenessRows(fields: readonly FieldRate[], locale: Locale): CompletenessRow[] {
  return fields.map((f) => ({
    field: f.field,
    label: t(locale, `comp.f.${f.field}` as MessageKey),
    known: f.known,
    unknown: f.unknown,
    share: formatRate(f.unknownPercent, locale),
  }));
}

/** Accessible table of overall UNKNOWN rates, with a plain explanation of what Unknown means. */
export function renderCompletenessHtml(c: Completeness, locale: Locale): string {
  const title = escapeHtml(t(locale, 'comp.title'));
  if (c.total === 0) {
    return `<section aria-labelledby="ds-comp-title"><h2 id="ds-comp-title">${title}</h2><p>${escapeHtml(t(locale, 'comp.none'))}</p></section>`;
  }
  const rows = completenessRows(c.fields, locale)
    .map(
      (r) =>
        `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${r.known}</td><td>${r.unknown}</td>` +
        `<td aria-label="${escapeHtml(r.share.ariaLabel)}">${escapeHtml(r.share.text)}</td></tr>`,
    )
    .join('');
  const th = (k: MessageKey) => `<th scope="col">${escapeHtml(t(locale, k))}</th>`;
  return (
    `<section aria-labelledby="ds-comp-title"><h2 id="ds-comp-title">${title}</h2>` +
    `<p>${escapeHtml(t(locale, 'comp.intro'))}</p>` +
    `<div class="ds-scroll" role="region" tabindex="0" aria-label="${title}"><table><caption>${title}</caption>` +
    `<thead><tr>${th('comp.field')}${th('comp.known')}${th('comp.unknown')}${th('comp.share')}</tr></thead><tbody>${rows}</tbody></table></div></section>`
  );
}

export const COMPLETENESS_SCHEMA_VERSION = 1;

/** Language-neutral JSON: field codes and counts, null (never 0) for an unmeasurable rate. */
export function completenessToJson(c: Completeness, now: Date): string {
  return `${JSON.stringify({ schemaVersion: COMPLETENESS_SCHEMA_VERSION, generatedAt: now.toISOString(), ...c }, null, 2)}\n`;
}

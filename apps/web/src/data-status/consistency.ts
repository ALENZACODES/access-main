/**
 * Cross-surface consistency: the same registry must say the same thing everywhere it is shown.
 *
 * checkConsistency() builds every output from one set of records (audit, summary.json, the CSV,
 * the DCAT catalogue, the source list, the review queue, the calendar, the QA counts and the
 * completeness table) and compares them. It reports differences as short strings, one per problem.
 * It never repairs anything: a mismatch is a bug to fix in the surface that disagrees.
 */
import { buildAttributions } from './attribution';
import { buildCatalogue, type Catalogue } from './catalogue';
import { buildCompleteness, completenessProblems } from './completeness';
import { auditedSourcesToCsv } from './csv';
import { auditRegistry, type AuditedSource, type AuditResult, type DatasetRecord } from './datasetRegistry';
import type { Locale } from './dataStatus';
import { buildIcs, icsEventCount } from './ics';
import { t } from './i18n';
import { auditProblems } from './invariants';
import { buildQaReport } from './qaReport';
import { addDaysIso, buildReviewQueue } from './reviewDue';
import { buildSourceList } from './sourceList';
import { buildSummary, summaryToJson, validateSummary } from './summary';
import type { Thresholds } from './thresholds';

/** Parse RFC 4180 CSV (CRLF or LF rows, quoted cells, doubled quotes, optional BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface ConsistencyResult {
  /** Names of the surfaces that were compared. */
  surfaces: string[];
  problems: string[];
}

/** Source ids that occur more than once cannot be matched one to one across surfaces. */
function ambiguous(audit: AuditResult, s: AuditedSource): boolean {
  return audit.sources.filter((x) => x.datasetId === s.datasetId && x.sourceId === s.sourceId).length > 1;
}

function key(s: AuditedSource): string {
  return `${s.datasetId}/${s.sourceId}`;
}

function openText(v: boolean | null, locale: Locale): string {
  return v === null ? t(locale, 'unknown') : v ? t(locale, 'cov.yes') : t(locale, 'cov.no');
}

/** Compare a parsed summary.json with the audit it should describe. */
export function compareSummary(audit: AuditResult, parsed: unknown, out: string[] = []): string[] {
  const invalid = validateSummary(parsed);
  for (const p of invalid) out.push(`summary: invalid ${p}`);
  // A summary that is not even the right shape cannot be compared field by field.
  if (invalid.some((p) => p === 'not an object' || p === 'sources' || p === 'totals')) return out;
  const sum = parsed as { totals: unknown; sources: Record<string, unknown>[] };
  if (JSON.stringify(sum.totals) !== JSON.stringify(audit.totals)) out.push('summary: totals differ from the audit');
  if (sum.sources.length !== audit.sources.length) out.push('summary: source count differs');
  audit.sources.forEach((s, i) => {
    const x = sum.sources[i];
    if (!x) return;
    if (x['state'] !== s.state) out.push(`summary: ${key(s)} state ${String(x['state'])} != ${s.state}`);
    if (x['retrieved'] !== s.retrievedIso) out.push(`summary: ${key(s)} retrieved differs`);
    if (x['licence'] !== s.licence) out.push(`summary: ${key(s)} licence differs`);
    if (x['licenceOpen'] !== s.licenceOpen) out.push(`summary: ${key(s)} licenceOpen differs`);
    if (JSON.stringify(x['issues']) !== JSON.stringify(s.issues)) out.push(`summary: ${key(s)} issues differ`);
  });
  return out;
}

/** Compare parsed CSV rows (header first) with the audit they should describe. */
export function compareCsv(audit: AuditResult, rows: readonly (readonly string[])[], locale: Locale, out: string[] = []): string[] {
  if (rows.length !== audit.sources.length + 1) {
    out.push(`csv(${locale}): ${rows.length - 1} rows for ${audit.sources.length} sources`);
    return out;
  }
  const unknown = t(locale, 'unknown');
  audit.sources.forEach((s, i) => {
    const r = rows[i + 1] as readonly string[];
    const at = `csv(${locale}): ${key(s)}`;
    if (r.length !== 7) out.push(`${at} has ${r.length} columns`);
    if (r[5] !== (s.retrievedIso ?? unknown)) out.push(`${at} retrieved ${String(r[5])} != ${s.retrievedIso ?? unknown}`);
    if (r[6] !== t(locale, `state.${s.state}`)) out.push(`${at} status ${String(r[6])}`);
    if (r[4] !== openText(s.licenceOpen, locale)) out.push(`${at} open-licence column`);
    // The formula guard may add one leading apostrophe; nothing else may change the value.
    const licence = (r[3] ?? '').replace(/^'(?=[=+\-@\t\r])/, '');
    if (licence !== (s.licence ?? unknown)) out.push(`${at} licence ${licence}`);
  });
  return out;
}

/** Compare a catalogue with the audit it should describe. */
export function compareCatalogue(audit: AuditResult, cat: Catalogue, out: string[] = []): string[] {
  const flat = cat['dcat:dataset'].flatMap((d) => d['prov:wasDerivedFrom']);
  if (flat.length !== audit.sources.length) out.push('catalogue: source count differs');
  const unique = audit.datasets.filter((d, i) => audit.datasets.findIndex((x) => x.id === d.id) === i);
  const ordered = unique.flatMap((d) => audit.sources.filter((s) => s.datasetId === d.id));
  ordered.forEach((s, i) => {
    const c = flat[i];
    if (!c) return;
    if (c['ds:state'] !== s.state) out.push(`catalogue: ${key(s)} state differs`);
    const fields = new Set(c['ds:unknown']);
    const expect = (name: 'name' | 'url' | 'licence' | 'retrieved', isUnknown: boolean) => {
      if (fields.has(name) !== isUnknown) out.push(`catalogue: ${key(s)} unknown.${name} differs`);
    };
    expect('name', s.name === null);
    expect('url', s.url === null);
    expect('licence', s.licence === null);
    expect('retrieved', s.retrievedIso === null);
    const stamp = c['prov:generatedAtTime']?.['@value'] ?? null;
    if (stamp !== s.retrievedIso) out.push(`catalogue: ${key(s)} retrieved differs`);
  });
  return out;
}

function sourceListProblems(records: readonly DatasetRecord[], audit: AuditResult, now: Date, locale: Locale, out: string[]): void {
  for (const r of records) {
    // Duplicate dataset ids cannot be matched one to one, so they are left to the audit's own findings.
    if (records.filter((x) => x.id === r.id).length > 1) continue;
    const own = audit.sources.filter((s) => s.datasetId === r.id);
    const rows = buildSourceList(r.sources, locale, now, audit.datasets.find((d) => d.id === r.id)?.staleAfterDays);
    if (rows.length !== own.length) {
      out.push(`source list: ${r.id} has ${rows.length} rows for ${own.length} audited sources`);
      continue;
    }
    for (const a of own) {
      if (ambiguous(audit, a)) continue;
      const row = rows.find((x) => x.id === a.sourceId && x.state === a.state);
      if (!row) {
        out.push(`source list: ${key(a)} state differs`);
        continue;
      }
      if (row.retrievedIso !== a.retrievedIso) out.push(`source list: ${key(a)} retrieved differs`);
      if (row.licenceOpen !== a.licenceOpen) out.push(`source list: ${key(a)} licenceOpen differs`);
      if (JSON.stringify(row.issues) !== JSON.stringify(a.issues)) out.push(`source list: ${key(a)} issues differ`);
    }
  }
}

function reviewProblems(audit: AuditResult, now: Date, locale: Locale, out: string[]): void {
  const queue = buildReviewQueue(audit, now);
  if (queue.length !== audit.sources.length) out.push('review: queue length differs from sources');
  for (const q of queue) {
    const s = audit.sources.find((x) => x.datasetId === q.datasetId && x.sourceId === q.sourceId);
    if (!s || ambiguous(audit, s)) continue;
    const at = `review: ${key(s)}`;
    if ((q.status === 'unknown') !== (s.state === 'unknown')) out.push(`${at} unknown status differs from the audit`);
    if (q.staleAfterDays !== s.limitDays) out.push(`${at} limit differs`);
    if (s.state !== 'unknown' && s.retrievedIso !== null) {
      const want = addDaysIso(s.retrievedIso, s.limitDays);
      if (q.dueIso !== want) out.push(`${at} due ${String(q.dueIso)} != ${String(want)}`);
      const overdue = q.status === 'overdue';
      if (overdue !== (s.state === 'stale')) out.push(`${at} overdue disagrees with stale`);
    } else if (q.dueIso !== null) out.push(`${at} is scheduled although the date is Unknown`);
  }
  const ics = buildIcs(queue, now, locale);
  const events = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
  if (events !== icsEventCount(queue)) out.push(`calendar: ${events} events for ${icsEventCount(queue)} scheduled reviews`);
  if (events !== audit.sources.filter((s) => s.state !== 'unknown').length) out.push('calendar: events differ from sources with a known date');
}

function countProblems(audit: AuditResult, locale: Locale, out: string[]): void {
  const qa = buildQaReport(audit, locale);
  const tot = audit.totals;
  const want = [tot.datasets, tot.sources, tot.stale, tot.unknownDate, tot.notOpen, tot.missingDetails, tot.duplicates];
  qa.counts.forEach((c, i) => {
    if (c.value !== want[i]) out.push(`qa(${locale}): ${c.key} ${c.value} != ${String(want[i])}`);
  });
  if (qa.items.length !== audit.findings.length) out.push(`qa(${locale}): item count differs from findings`);
  const comp = buildCompleteness(audit);
  for (const p of completenessProblems(comp)) out.push(`completeness: ${p}`);
  const retrieved = comp.fields.find((f) => f.field === 'retrieved');
  if (retrieved && retrieved.unknown !== tot.unknownDate) out.push('completeness: unknown dates differ from totals.unknownDate');
  const licence = comp.fields.find((f) => f.field === 'licence');
  if (licence && licence.unknown !== audit.sources.filter((s) => s.issues.includes('missing-licence')).length) out.push('completeness: unknown licences differ from missing-licence issues');
}

function attributionProblems(audit: AuditResult, locale: Locale, out: string[]): void {
  const entries = buildAttributions(audit.sources, locale);
  if (entries.length !== audit.sources.length) out.push('credits: entry count differs');
  const dates = entries.map((e) => e.retrievedIso).filter((d): d is string => d !== null).sort();
  const want = audit.sources.map((s) => s.retrievedIso).filter((d): d is string => d !== null).sort();
  if (JSON.stringify(dates) !== JSON.stringify(want)) out.push('credits: retrieved dates differ from the audit');
}

/** Compare every surface for one set of records. */
export function checkConsistency(
  records: readonly DatasetRecord[],
  now: Date,
  options: { thresholds?: Thresholds; locales?: readonly Locale[] } = {},
): ConsistencyResult {
  const audit = auditRegistry(records, now, options.thresholds);
  const locales = options.locales ?? (['en', 'fr'] as const);
  const problems: string[] = [...auditProblems(audit)];
  compareSummary(audit, JSON.parse(summaryToJson(buildSummary(audit, now))), problems);
  compareCatalogue(audit, buildCatalogue(audit, now), problems);
  for (const locale of locales) {
    compareCsv(audit, parseCsv(auditedSourcesToCsv(audit.sources, locale)), locale, problems);
    sourceListProblems(records, audit, now, locale, problems);
    reviewProblems(audit, now, locale, problems);
    countProblems(audit, locale, problems);
    attributionProblems(audit, locale, problems);
  }
  return { surfaces: ['audit', 'summary', 'catalogue', 'csv', 'source list', 'review', 'calendar', 'qa counts', 'completeness', 'credits'], problems };
}

export const CONSISTENCY_SCHEMA_VERSION = 1;

/** Language-neutral JSON for the consistency route. */
export function consistencyToJson(r: ConsistencyResult, now: Date): string {
  return `${JSON.stringify({ schemaVersion: CONSISTENCY_SCHEMA_VERSION, generatedAt: now.toISOString(), consistent: r.problems.length === 0, surfaces: r.surfaces, problems: r.problems }, null, 2)}\n`;
}

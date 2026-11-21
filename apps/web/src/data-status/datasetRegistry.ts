/**
 * Registry audit: every dataset must carry source, open licence and retrieved date.
 * The audit reports gaps; it never fills them in. Unknown stays Unknown.
 */
import { ageInDays, checkProvenance, freshness, licenceKind, type FreshnessState, type ProvenanceIssue } from './dataStatus';
import { parseRetrieved } from './dateRules';
import { cleanValue } from './unknownTokens';
import { tierOf, type TierId } from './tierValue';
import { staleAfterFor, type DatasetKind } from './freshnessPolicy';
import type { SourceInput } from './sourceList';

export interface DatasetRecord {
  id: string;
  name: string;
  kind: DatasetKind;
  sources: SourceInput[];
}

export type FindingCode =
  | ProvenanceIssue
  | 'stale'
  | 'no-sources'
  | 'duplicate-dataset-id'
  | 'duplicate-source-id'
  | 'empty-name';

export interface Finding {
  datasetId: string;
  datasetName: string;
  sourceId: string | null;
  code: FindingCode;
}

export interface AuditedSource {
  datasetId: string;
  datasetName: string;
  kind: DatasetKind;
  sourceId: string;
  name: string | null;
  url: string | null;
  licence: string | null;
  /** true = on the open list, false = present but not on it, null = licence not recorded. */
  licenceOpen: boolean | null;
  /** UTC day of retrieval (YYYY-MM-DD) when the date is real; null otherwise. A future day is kept here and the state is Unknown. */
  retrievedIso: string | null;
  /** Whole calendar days (UTC) since retrieval; null when the date is missing, invalid or in the future. */
  ageDays: number | null;
  /** The staleness limit applied: stale means more than this many days old. */
  limitDays: number;
  state: FreshnessState;
  issues: ProvenanceIssue[];
  /** The tier written on the record (0 to 4, or E); null when none is recorded or the text is not a tier. */
  tier: TierId | null;
}

export interface DatasetAudit {
  id: string;
  name: string;
  kind: DatasetKind;
  sourceCount: number;
  /** stale if any source is stale; else unknown if any is unknown (or none exist); else fresh. */
  state: FreshnessState;
  staleAfterDays: number;
  findings: Finding[];
}

export interface AuditTotals {
  datasets: number;
  sources: number;
  stale: number;
  unknownDate: number;
  notOpen: number;
  missingDetails: number;
  duplicates: number;
}

export interface AuditResult {
  datasets: DatasetAudit[];
  sources: AuditedSource[];
  findings: Finding[];
  totals: AuditTotals;
}

const FINDING_RANK: Readonly<Record<FindingCode, number>> = {
  'missing-source': 0,
  'missing-licence': 0,
  'licence-unrecognised': 0,
  'duplicate-dataset-id': 0,
  'duplicate-source-id': 0,
  'empty-name': 1,
  'no-sources': 1,
  'missing-date': 1,
  'invalid-date': 1,
  'future-date': 1,
  stale: 2,
};

export function findingRank(code: FindingCode): number {
  return FINDING_RANK[code];
}

const clean = cleanValue;

function httpUrl(v: string | null | undefined): string | null {
  const u = clean(v);
  if (u === null) return null;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null;
  } catch {
    return null;
  }
}

function countBy<T>(items: readonly T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return m;
}

export function auditRegistry(
  records: readonly DatasetRecord[],
  now: Date,
  overrides?: Partial<Record<DatasetKind, number>>,
): AuditResult {
  const datasetIdCounts = countBy(records, (r) => r.id);
  const datasets: DatasetAudit[] = [];
  const sources: AuditedSource[] = [];
  const all: Finding[] = [];

  for (const r of records) {
    const days = staleAfterFor(r.kind, overrides);
    const display = clean(r.name) ?? r.id;
    const own: Finding[] = [];
    const add = (sourceId: string | null, code: FindingCode) =>
      own.push({ datasetId: r.id, datasetName: display, sourceId, code });

    if (clean(r.name) === null) add(null, 'empty-name');
    if ((datasetIdCounts.get(r.id) ?? 0) > 1) add(null, 'duplicate-dataset-id');
    if (r.sources.length === 0) add(null, 'no-sources');

    const sourceIdCounts = countBy(r.sources, (s) => s.id);
    const reportedDuplicate = new Set<string>();
    let sawStale = false;
    let sawUnknown = false;

    for (const s of r.sources) {
      if ((sourceIdCounts.get(s.id) ?? 0) > 1 && !reportedDuplicate.has(s.id)) {
        reportedDuplicate.add(s.id);
        add(s.id, 'duplicate-source-id');
      }
      const issues = checkProvenance(s, now);
      for (const code of issues) add(s.id, code);
      const state = freshness(s.retrievedAt, now, days);
      if (state === 'stale') {
        add(s.id, 'stale');
        sawStale = true;
      } else if (state === 'unknown') sawUnknown = true;

      const licence = clean(s.licence);
      sources.push({
        datasetId: r.id,
        datasetName: display,
        kind: r.kind,
        sourceId: s.id,
        name: clean(s.name) ?? clean(s.source),
        url: httpUrl(s.url),
        licence,
        licenceOpen: licence === null || licenceKind(licence) === 'unknown' ? null : licenceKind(licence) !== 'unrecognised',
        retrievedIso: parseRetrieved(s.retrievedAt)?.day ?? null,
        ageDays: ageInDays(s.retrievedAt, now),
        limitDays: days,
        state,
        issues,
        tier: tierOf(s.tier),
      });
    }

    const state: FreshnessState =
      r.sources.length === 0 ? 'unknown' : sawStale ? 'stale' : sawUnknown ? 'unknown' : 'fresh';
    datasets.push({
      id: r.id,
      name: display,
      kind: r.kind,
      sourceCount: r.sources.length,
      state,
      staleAfterDays: days,
      findings: own,
    });
    all.push(...own);
  }

  all.sort(
    (a, b) =>
      findingRank(a.code) - findingRank(b.code) ||
      a.datasetName.localeCompare(b.datasetName) ||
      (a.sourceId ?? '').localeCompare(b.sourceId ?? '') ||
      a.code.localeCompare(b.code),
  );
  datasets.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  sources.sort(
    (a, b) =>
      a.datasetName.localeCompare(b.datasetName) ||
      (a.name ?? a.sourceId).localeCompare(b.name ?? b.sourceId) ||
      a.sourceId.localeCompare(b.sourceId),
  );

  return {
    datasets,
    sources,
    findings: all,
    totals: {
      datasets: records.length,
      sources: sources.length,
      stale: sources.filter((s) => s.state === 'stale').length,
      unknownDate: sources.filter((s) => s.state === 'unknown').length,
      notOpen: sources.filter((s) => s.licenceOpen === false).length,
      missingDetails: all.filter((f) => f.code.startsWith('missing-')).length,
      duplicates: all.filter((f) => f.code.startsWith('duplicate-')).length,
    },
  };
}

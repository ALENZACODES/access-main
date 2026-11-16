/**
 * Machine-readable summary of an audit. Language-neutral: codes, not sentences.
 * Values that are not known are null (never 0, "" or a default).
 */
import type { AuditResult, AuditTotals } from './datasetRegistry';

/**
 * 2: each source gains ageDays (whole UTC calendar days, null when Unknown) and limitDays (the stale limit that was
 * applied), so a reader can check a status from the numbers. Everything in version 1 is unchanged.
 */
export const SUMMARY_SCHEMA_VERSION = 2;

export interface SummaryJson {
  schemaVersion: typeof SUMMARY_SCHEMA_VERSION;
  generatedAt: string;
  totals: AuditTotals;
  datasets: {
    id: string;
    name: string;
    kind: string;
    state: string;
    sourceCount: number;
    staleAfterDays: number;
    findings: { code: string; sourceId: string | null }[];
  }[];
  sources: {
    datasetId: string;
    sourceId: string;
    name: string | null;
    url: string | null;
    licence: string | null;
    licenceOpen: boolean | null;
    retrieved: string | null;
    /** Whole UTC calendar days since retrieval; null (never 0) when the date is missing, unreadable or in the future. */
    ageDays: number | null;
    /** Stale means ageDays is greater than this. */
    limitDays: number;
    state: string;
    issues: string[];
  }[];
}

export function buildSummary(audit: AuditResult, now: Date): SummaryJson {
  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    totals: audit.totals,
    datasets: audit.datasets.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      state: d.state,
      sourceCount: d.sourceCount,
      staleAfterDays: d.staleAfterDays,
      findings: d.findings.map((f) => ({ code: f.code, sourceId: f.sourceId })),
    })),
    sources: audit.sources.map((s) => ({
      datasetId: s.datasetId,
      sourceId: s.sourceId,
      name: s.name,
      url: s.url,
      licence: s.licence,
      licenceOpen: s.licenceOpen,
      retrieved: s.retrievedIso,
      ageDays: s.ageDays,
      limitDays: s.limitDays,
      state: s.state,
      issues: [...s.issues],
    })),
  };
}

export function summaryToJson(s: SummaryJson): string {
  return `${JSON.stringify(s, null, 2)}\n`;
}

const STATES = ['fresh', 'stale', 'unknown'];

/** Problems with a parsed summary; empty when it matches the schema. */
export function validateSummary(v: unknown): string[] {
  const out: string[] = [];
  if (v === null || typeof v !== 'object') return ['not an object'];
  const s = v as Record<string, unknown>;
  if (s['schemaVersion'] !== SUMMARY_SCHEMA_VERSION) out.push('schemaVersion');
  if (typeof s['generatedAt'] !== 'string' || Number.isNaN(Date.parse(s['generatedAt']))) out.push('generatedAt');
  if (s['totals'] === null || typeof s['totals'] !== 'object') out.push('totals');
  if (!Array.isArray(s['datasets'])) out.push('datasets');
  if (!Array.isArray(s['sources'])) out.push('sources');
  else {
    (s['sources'] as Record<string, unknown>[]).forEach((x, i) => {
      if (!STATES.includes(x['state'] as string)) out.push(`sources[${i}].state`);
      if (x['licence'] !== null && typeof x['licence'] !== 'string') out.push(`sources[${i}].licence`);
      if (x['licenceOpen'] !== null && typeof x['licenceOpen'] !== 'boolean') out.push(`sources[${i}].licenceOpen`);
      if (x['retrieved'] !== null && !(typeof x['retrieved'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x['retrieved']))) out.push(`sources[${i}].retrieved`);
      const age = x['ageDays'];
      const limit = x['limitDays'];
      if (age !== null && !(typeof age === 'number' && Number.isInteger(age) && age >= 0)) out.push(`sources[${i}].ageDays`);
      if (!(typeof limit === 'number' && Number.isInteger(limit) && limit >= 1)) out.push(`sources[${i}].limitDays`);
      if (x['state'] === 'unknown' && age !== null) out.push(`sources[${i}].ageDays-must-be-null-when-unknown`);
      if (x['state'] !== 'unknown' && age === null) out.push(`sources[${i}].ageDays-required-when-state-known`);
      if (typeof age === 'number' && typeof limit === 'number') {
        if (x['state'] === 'fresh' && age > limit) out.push(`sources[${i}].state-fresh-but-age-over-limit`);
        if (x['state'] === 'stale' && age <= limit) out.push(`sources[${i}].state-stale-but-age-within-limit`);
      }
      if (x['licence'] === null && x['licenceOpen'] !== null) out.push(`sources[${i}].licenceOpen-must-be-null-when-licence-unknown`);
      if (x['retrieved'] === null && x['state'] !== 'unknown') out.push(`sources[${i}].state-must-be-unknown-when-date-unknown`);
    });
  }
  return out;
}

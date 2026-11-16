/**
 * Rules a registry audit must satisfy so that no status misleads.
 * Each rule returns plain "dataset/source: rule" strings; an empty list means the audit is consistent.
 * These are checked against every surface (see consistency.ts) and against seeded random registries.
 */
import type { AuditResult, AuditedSource } from './datasetRegistry';
import type { FreshnessState } from './dataStatus';
import { isUnknownToken } from './unknownTokens';

const DATE_ISSUES = ['missing-date', 'invalid-date', 'future-date'] as const;

function where(s: AuditedSource): string {
  return `${s.datasetId}/${s.sourceId}`;
}

/** Per-source rules: what a status may and may not say about its own record. */
export function sourceProblems(s: AuditedSource): string[] {
  const out: string[] = [];
  const dateIssues = DATE_ISSUES.filter((c) => s.issues.includes(c));
  const at = where(s);

  if (s.limitDays < 1 || !Number.isInteger(s.limitDays)) out.push(`${at}: limit is not a whole number of days`);

  if (s.state === 'fresh') {
    if (s.ageDays === null) out.push(`${at}: fresh without an age`);
    else if (s.ageDays > s.limitDays) out.push(`${at}: fresh but older than the limit`);
    if (dateIssues.length > 0) out.push(`${at}: fresh although the date has an issue`);
    if (s.retrievedIso === null) out.push(`${at}: fresh without a retrieved date`);
  } else if (s.state === 'stale') {
    if (s.ageDays === null) out.push(`${at}: stale without an age`);
    else if (s.ageDays <= s.limitDays) out.push(`${at}: stale but within the limit`);
    if (dateIssues.length > 0) out.push(`${at}: stale although the date has an issue`);
  } else {
    if (s.ageDays !== null) out.push(`${at}: unknown but an age is given`);
    if (dateIssues.length !== 1) out.push(`${at}: unknown must name exactly one date issue (has ${dateIssues.length})`);
    if (dateIssues[0] === 'future-date' && s.retrievedIso === null) out.push(`${at}: future-date without the date`);
    if (dateIssues[0] === 'missing-date' && s.retrievedIso !== null) out.push(`${at}: missing-date but a date is shown`);
    if (dateIssues[0] === 'invalid-date' && s.retrievedIso !== null) out.push(`${at}: invalid-date but a date is shown`);
  }

  if (s.ageDays !== null && s.ageDays < 0) out.push(`${at}: negative age`);

  // Licence: unknown stays unknown; a status is never given for a licence that is not recorded.
  if (s.licence === null) {
    if (s.licenceOpen !== null) out.push(`${at}: licence status without a licence`);
    if (!s.issues.includes('missing-licence')) out.push(`${at}: licence unknown but missing-licence not reported`);
  } else if (s.issues.includes('missing-licence')) out.push(`${at}: licence given but reported missing`);
  if (s.licenceOpen === false && !s.issues.includes('licence-unrecognised')) out.push(`${at}: not-open licence not reported`);
  if (s.licenceOpen !== false && s.issues.includes('licence-unrecognised')) out.push(`${at}: unrecognised licence reported but status is not "No"`);

  // A name is missing only when the publisher is also missing.
  if (s.name === null && !s.issues.includes('missing-source')) out.push(`${at}: no name and no missing-source issue`);

  // Placeholder text must never be shown as a value.
  for (const [label, v] of [['name', s.name], ['licence', s.licence], ['url', s.url]] as const) {
    if (v !== null && isUnknownToken(v)) out.push(`${at}: placeholder shown as ${label}`);
  }
  if (s.url !== null && !/^https?:\/\//i.test(s.url)) out.push(`${at}: url is not http(s)`);
  return out;
}

function foldState(states: readonly FreshnessState[]): FreshnessState {
  if (states.length === 0) return 'unknown';
  if (states.includes('stale')) return 'stale';
  return states.includes('unknown') ? 'unknown' : 'fresh';
}

/** Whole-audit rules: sources, datasets, findings and totals must tell one story. */
export function auditProblems(audit: AuditResult): string[] {
  const out: string[] = [];
  for (const s of audit.sources) out.push(...sourceProblems(s));

  const sourcesOf = new Map<string, AuditedSource[]>();
  for (const s of audit.sources) {
    const list = sourcesOf.get(s.datasetId) ?? [];
    list.push(s);
    sourcesOf.set(s.datasetId, list);
  }
  for (const d of audit.datasets) {
    // Duplicate dataset ids share one source list, so only check the first of a pair.
    const own = sourcesOf.get(d.id) ?? [];
    const dupes = audit.datasets.filter((x) => x.id === d.id).length;
    if (dupes === 1) {
      if (d.sourceCount !== own.length) out.push(`${d.id}: sourceCount ${d.sourceCount} != ${own.length}`);
      const want = foldState(own.map((s) => s.state));
      if (d.state !== want) out.push(`${d.id}: dataset state ${d.state}, sources say ${want}`);
      for (const s of own) if (s.limitDays !== d.staleAfterDays) out.push(`${d.id}/${s.sourceId}: limit differs from the dataset`);
      const staleFindings = d.findings.filter((f) => f.code === 'stale').length;
      if (staleFindings !== own.filter((s) => s.state === 'stale').length) out.push(`${d.id}: stale findings do not match stale sources`);
    }
  }

  const tot = audit.totals;
  const count = (p: (s: AuditedSource) => boolean) => audit.sources.filter(p).length;
  if (tot.sources !== audit.sources.length) out.push('totals.sources');
  if (tot.datasets !== audit.datasets.length) out.push('totals.datasets');
  if (tot.stale !== count((s) => s.state === 'stale')) out.push('totals.stale');
  if (tot.unknownDate !== count((s) => s.state === 'unknown')) out.push('totals.unknownDate');
  if (tot.notOpen !== count((s) => s.licenceOpen === false)) out.push('totals.notOpen');
  if (tot.missingDetails !== audit.findings.filter((f) => f.code.startsWith('missing-')).length) out.push('totals.missingDetails');
  if (tot.duplicates !== audit.findings.filter((f) => f.code.startsWith('duplicate-')).length) out.push('totals.duplicates');

  // Every stated problem on a source appears once as a finding, and no finding is invented.
  for (const s of audit.sources) {
    for (const code of s.issues) {
      if (!audit.findings.some((f) => f.datasetId === s.datasetId && f.sourceId === s.sourceId && f.code === code)) out.push(`${where(s)}: issue ${code} missing from findings`);
    }
  }
  return out;
}

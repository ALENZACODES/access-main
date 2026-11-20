/** Offline retention drift detection. A comparison never changes a record. */
import { retentionCanonical, retentionIssue, retentionFingerprint } from './offline-release-retention.mjs';

export const RETENTION_DELTA_KINDS = Object.freeze([
  'added', 'removed', 'path-changed', 'kind-changed', 'digest-changed',
  'bytes-changed', 'state-changed', 'claim-changed', 'source-changed',
  'licence-changed', 'date-changed', 'tier-changed', 'label-changed',
  'reference-changed', 'event-changed',
]);
const riskOrder = Object.freeze({
  'removed': 0, 'source-changed': 1, 'licence-changed': 2,
  'claim-changed': 3, 'digest-changed': 4, 'reference-changed': 5,
  'state-changed': 6, 'tier-changed': 7, 'path-changed': 8,
  'date-changed': 9, 'event-changed': 10, 'kind-changed': 11,
  'bytes-changed': 12, 'label-changed': 13, 'added': 14,
});
const severity = Object.freeze({
  'removed': 'block', 'source-changed': 'review', 'licence-changed': 'block',
  'claim-changed': 'block', 'digest-changed': 'review', 'reference-changed': 'review',
  'state-changed': 'review', 'tier-changed': 'review', 'path-changed': 'review',
  'date-changed': 'review', 'event-changed': 'review', 'kind-changed': 'review',
  'bytes-changed': 'review', 'label-changed': 'review', 'added': 'review',
});
export function retentionEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export function retentionDifferences(a, b) {
  const differences = [];
  if (a.path !== b.path) differences.push('path-changed');
  if (a.kind !== b.kind) differences.push('kind-changed');
  if (a.digest !== b.digest) differences.push('digest-changed');
  if (a.bytes !== b.bytes) differences.push('bytes-changed');
  if (a.state !== b.state) differences.push('state-changed');
  if (!retentionEqual(a.claims, b.claims)) differences.push('claim-changed');
  if (a.source !== b.source) differences.push('source-changed');
  if (a.licence !== b.licence) differences.push('licence-changed');
  if (a.retrievedOn !== b.retrievedOn) differences.push('date-changed');
  if (a.tier !== b.tier) differences.push('tier-changed');
  if (!retentionEqual(a.labels, b.labels)) differences.push('label-changed');
  if (!retentionEqual(a.references, b.references)) differences.push('reference-changed');
  if (!retentionEqual(a.events, b.events)) differences.push('event-changed');
  return differences.sort((x, y) => riskOrder[x] - riskOrder[y]);
}
function item(id, kind, before, after) {
  return Object.freeze({ id, kind, severity: severity[kind],
    beforeState: before?.state ?? null, afterState: after?.state ?? null,
    beforeClaims: before?.claims ?? null, afterClaims: after?.claims ?? null,
    beforeSource: before?.source ?? null, afterSource: after?.source ?? null,
    beforeLicence: before?.licence ?? null, afterLicence: after?.licence ?? null,
    beforeDate: before?.retrievedOn ?? null, afterDate: after?.retrievedOn ?? null,
    beforeTier: before?.tier ?? null, afterTier: after?.tier ?? null });
}
export function compareRetention(earlier, later, options = {}) {
  const first = retentionCanonical(earlier, options);
  const second = retentionCanonical(later, options);
  const problems = [
    ...first.problems.map((entry) => ({ ...entry, snapshot: 'earlier' })),
    ...second.problems.map((entry) => ({ ...entry, snapshot: 'later' })),
  ];
  if (problems.length) return { ok: false, problems, changes: [], summary: null };
  const a = new Map(first.document.records.map((entry) => [entry.id, entry]));
  const b = new Map(second.document.records.map((entry) => [entry.id, entry]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x.localeCompare(y, 'en'));
  const changes = [];
  let unchanged = 0;
  for (const id of ids) {
    const before = a.get(id);
    const after = b.get(id);
    if (!before) changes.push(item(id, 'added', null, after));
    else if (!after) changes.push(item(id, 'removed', before, null));
    else {
      const differences = retentionDifferences(before, after);
      if (!differences.length) unchanged += 1;
      for (const kind of differences) changes.push(item(id, kind, before, after));
    }
  }
  const counts = Object.fromEntries(RETENTION_DELTA_KINDS.map((kind) => [kind, 0]));
  for (const change of changes) counts[change.kind] += 1;
  return { ok: true, problems: [], changes,
    summary: { earlier: a.size, later: b.size, unchanged, changes: changes.length,
      block: changes.filter((entry) => entry.severity === 'block').length,
      review: changes.filter((entry) => entry.severity === 'review').length,
      counts } };
}
export function retentionImpact(document, changedIds, options = {}) {
  const check = retentionCanonical(document, options);
  if (!check.ok) return { ok: false, problems: check.problems, affected: [] };
  if (!Array.isArray(changedIds) || changedIds.length > 20_000 ||
      changedIds.some((id) => typeof id !== 'string')) {
    return { ok: false, problems: [retentionIssue('CHANGED_IDS_INVALID', '/changedIds')], affected: [] };
  }
  const reverse = new Map();
  const ids = new Set(check.document.records.map((record) => record.id));
  for (const record of check.document.records) {
    for (const target of record.references) {
      if (!reverse.has(target)) reverse.set(target, new Set());
      reverse.get(target).add(record.id);
    }
  }
  const missing = [...new Set(changedIds)].filter((id) => !ids.has(id));
  if (missing.length) return { ok: false,
    problems: missing.map((id) => retentionIssue('CHANGED_ID_MISSING', `/changedIds/${id}`)),
    affected: [] };
  const visited = new Set(changedIds);
  const queue = [...changedIds];
  const affected = [];
  while (queue.length) {
    const next = queue.shift();
    for (const parent of reverse.get(next) ?? []) {
      if (visited.has(parent)) continue;
      visited.add(parent);
      affected.push({ id: parent, because: next });
      queue.push(parent);
    }
  }
  affected.sort((x, y) => x.id.localeCompare(y.id, 'en'));
  return { ok: true, problems: [], affected };
}
export function retainedCoverage(document, options = {}) {
  const canonical = retentionCanonical(document, options);
  if (!canonical.ok) return { ok: false, problems: canonical.problems, summary: null };
  const byState = Object.fromEntries(['present', 'quarantined', 'withdrawn', 'retired'].map((s) => [s, 0]));
  const byKind = Object.fromEntries(['script', 'style', 'document', 'image', 'font', 'dataset', 'translation'].map((s) => [s, 0]));
  const byClaim = { YES: 0, NO: 0, UNKNOWN: 0 };
  let bytes = 0;
  let blockedBytes = 0;
  let referenced = 0;
  for (const entry of canonical.document.records) {
    byState[entry.state] += 1;
    byKind[entry.kind] += 1;
    for (const claim of entry.claims) byClaim[claim] += 1;
    bytes += entry.bytes;
    referenced += entry.references.length;
    if (entry.state !== 'present') blockedBytes += entry.bytes;
  }
  return { ok: true, problems: [], summary: {
    records: canonical.document.records.length, bytes, blockedBytes,
    references: referenced, byState, byKind, byClaim,
  } };
}
export function retentionGuard(earlier, later, expectedFingerprint, options = {}) {
  const fingerprint = retentionFingerprint(earlier, options);
  if (!fingerprint.ok) return { ok: false, problems: fingerprint.problems, comparison: null };
  if (fingerprint.fingerprint !== expectedFingerprint) {
    return { ok: false, problems: [retentionIssue('BASE_MISMATCH', '/')], comparison: null };
  }
  const comparison = compareRetention(earlier, later, options);
  if (!comparison.ok) return { ok: false, problems: comparison.problems, comparison: null };
  return { ok: true, problems: [], comparison };
}

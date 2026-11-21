/** Analyse evidence disagreement, not physical accessibility. */
import { createHash } from 'node:crypto';
import { validateRegister, canonicalRegister } from './offline-conflict-contract.mjs';

export const CONFLICT_KINDS = Object.freeze([
  'opposed', 'source-contradiction', 'missing-claim', 'dated-conflict',
  'source-shared', 'related-disagreement',
]);
export const REVIEW_PRIORITIES = Object.freeze(['block', 'review', 'information']);
const keyOf = value => `${value.subject}\u0000${value.attribute}`;
const cmp = (a, b) => a.localeCompare(b, 'en');
const uniqueSorted = values => [...new Set(values)].sort(cmp);
const hash = value => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

/** Same record id never determines whether evidence agrees. */
export function groupEvidence(records) {
  const buckets = new Map();
  for (const entry of records) {
    const key = keyOf(entry);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }
  return [...buckets].sort(([a], [b]) => cmp(a, b)).map(([key, entries]) => ({
    key, subject: entries[0].subject, attribute: entries[0].attribute,
    entries: [...entries].sort((a, b) => cmp(a.id, b.id)),
  }));
}

export function provenanceKey(record) {
  return JSON.stringify([record.source, record.licence, record.retrievedOn, record.tier]);
}
export function evidenceSignature(record) {
  return hash({ id: record.id, state: record.state, capturedOn: record.capturedOn,
    source: record.source, licence: record.licence, retrievedOn: record.retrievedOn,
    tier: record.tier, sourceDate: record.sourceDate ?? null,
    relatedIds: [...(record.relatedIds ?? [])].sort(),
  });
}
export function classifyGroup(group) {
  const records = group.entries;
  const values = new Set(records.map(record => record.state));
  const known = records.filter(record => record.state !== 'UNKNOWN');
  const provenance = uniqueSorted(records.map(provenanceKey));
  const sourceUrls = uniqueSorted(records.map(record => record.source));
  const events = [];
  if (values.has('YES') && values.has('NO')) {
    events.push({ kind: 'opposed', priority: 'block', detail: 'Opposed recorded claims require human inspection' });
  }
  if (known.length === 0) {
    events.push({ kind: 'missing-claim', priority: 'review', detail: 'No source-backed observation has a known state' });
  }
  for (const source of sourceUrls) {
    const sourceStates = new Set(records.filter(record => record.source === source).map(record => record.state));
    if (sourceStates.has('YES') && sourceStates.has('NO')) {
      events.push({ kind: 'source-contradiction', priority: 'block', detail: 'Opposing claims share a source URL' });
    }
  }
  if (records.length > 1) {
    const dates = uniqueSorted(records.map(record => record.capturedOn));
    const recordedStates = uniqueSorted(records.map(record => record.state));
    if (dates.length > 1 && recordedStates.length > 1) {
      events.push({ kind: 'dated-conflict', priority: 'review', detail: 'Different observation dates carry different states' });
    }
  }
  if (records.length > 1 && provenance.length === 1) {
    events.push({ kind: 'source-shared', priority: 'information', detail: 'Records share one source, not independent evidence' });
  }
  return events;
}

export function classifyRelationships(records) {
  const byId = new Map(records.map(record => [record.id, record]));
  const seen = new Set();
  const results = [];
  for (const record of [...records].sort((a, b) => cmp(a.id, b.id))) {
    for (const id of record.relatedIds ?? []) {
      const other = byId.get(id);
      if (!other) continue;
      const joined = uniqueSorted([record.id, other.id]);
      const key = joined.join('\u0000');
      if (seen.has(key)) continue;
      seen.add(key);
      if (record.subject !== other.subject || record.attribute !== other.attribute) continue;
      if (record.state !== other.state && record.state !== 'UNKNOWN' && other.state !== 'UNKNOWN') {
        results.push({ kind: 'related-disagreement', priority: 'block',
          subject: record.subject, attribute: record.attribute,
          recordIds: joined, sourceUrls: uniqueSorted([record.source, other.source]) });
      }
    }
  }
  return results;
}

/** A group is not cleared by a majority vote, source tier, or newer date. */
export function analyzeConflicts(register, options = {}) {
  const check = validateRegister(register, options);
  if (!check.ok) return { ok: false, problems: check.problems, conflicts: [], summary: null, fingerprint: null };
  const groups = groupEvidence(register.records);
  const conflicts = [];
  for (const group of groups) {
    for (const issue of classifyGroup(group)) {
      conflicts.push({ kind: issue.kind, priority: issue.priority, subject: group.subject,
        attribute: group.attribute, recordIds: group.entries.map(entry => entry.id),
        sourceUrls: uniqueSorted(group.entries.map(entry => entry.source)) });
    }
  }
  conflicts.push(...classifyRelationships(register.records));
  const sorted = conflicts.sort((a, b) =>
    cmp(a.subject, b.subject) || cmp(a.attribute, b.attribute) || cmp(a.kind, b.kind) ||
    cmp(a.recordIds.join('|'), b.recordIds.join('|')));
  const summary = {
    totalRecords: register.records.length, totalGroups: groups.length,
    unknownRecords: register.records.filter(record => record.state === 'UNKNOWN').length,
    opposedGroups: groups.filter(group => group.entries.some(x => x.state === 'YES') &&
      group.entries.some(x => x.state === 'NO')).length,
    conflicts: sorted.length,
    byPriority: Object.fromEntries(REVIEW_PRIORITIES.map(priority =>
      [priority, sorted.filter(item => item.priority === priority).length])),
    byKind: Object.fromEntries(CONFLICT_KINDS.map(kind =>
      [kind, sorted.filter(item => item.kind === kind).length])),
  };
  return { ok: true, problems: [], conflicts: sorted, summary,
    fingerprint: hash(canonicalRegister(register)) };
}

export function reviewPlan(register, options = {}) {
  const result = analyzeConflicts(register, options);
  if (!result.ok) return { ok: false, problems: result.problems, tasks: [], summary: null };
  const weights = { block: 3, review: 2, information: 1 };
  const tasks = [...result.conflicts]
    .sort((a, b) => weights[b.priority] - weights[a.priority] ||
      cmp(a.subject, b.subject) || cmp(a.attribute, b.attribute) || cmp(a.kind, b.kind))
    .map((conflict, index) => ({ order: index + 1, action: 'human-review',
      priority: conflict.priority, reason: conflict.kind, subject: conflict.subject,
      attribute: conflict.attribute, recordIds: [...conflict.recordIds],
      sourceUrls: [...conflict.sourceUrls], outcome: 'UNKNOWN' }));
  return { ok: true, problems: [], tasks, summary: result.summary };
}

export function groupCoverage(register, requested, options = {}) {
  const checked = validateRegister(register, options);
  if (!checked.ok) return { ok: false, problems: checked.problems, missing: [] };
  if (!Array.isArray(requested) || requested.length > 500 ||
    requested.some(item => !item || typeof item.subject !== 'string' || typeof item.attribute !== 'string')) {
    return { ok: false, problems: [{ code: 'COVERAGE_INPUT', path: '/' }], missing: [] };
  }
  const groups = new Set(groupEvidence(register.records).map(group => group.key));
  const missing = [];
  for (const item of requested) {
    if (!groups.has(keyOf(item))) missing.push({
      subject: item.subject, attribute: item.attribute, state: 'UNKNOWN',
      reason: 'not-recorded',
    });
  }
  return { ok: true, problems: [], missing: missing.sort((a, b) =>
    cmp(a.subject, b.subject) || cmp(a.attribute, b.attribute)) };
}

/** Compare two independently validated incident registers without silently clearing risks. */
import { createHash } from 'node:crypto';
import {
  canonicalIncident, incidentFingerprint, inspectIncidentRegister,
} from './offline-release-incidents.mjs';

export const DELTA_KINDS = Object.freeze([
  'added', 'removed', 'status-changed', 'severity-changed', 'area-changed',
  'translation-changed', 'source-changed', 'source-lost', 'source-gained',
  'dependency-changed', 'history-changed', 'same',
]);
const kindSet = new Set(DELTA_KINDS);
const priority = Object.freeze({ critical: 0, high: 1, moderate: 2, low: 3 });
function problem(code, path) { return { code, path }; }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function fingerprintEntry(entry) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalIncident(entry))).digest('hex')}`;
}
function metadata(entry) {
  return {
    sourceRefs: [...entry.sourceRefs].sort(),
    sources: [...entry.sources].sort((a, b) => a.id.localeCompare(b.id, 'en')),
  };
}
export function changesForIncident(before, after) {
  const changes = [];
  if (before.status !== after.status) changes.push('status-changed');
  if (before.severity !== after.severity) changes.push('severity-changed');
  if (before.area !== after.area) changes.push('area-changed');
  if (!equal(before.title, after.title) || !equal(before.summary, after.summary)) {
    changes.push('translation-changed');
  }
  const left = metadata(before);
  const right = metadata(after);
  if (!equal(left.sources, right.sources)) changes.push('source-changed');
  const previousIds = new Set(left.sourceRefs);
  const laterIds = new Set(right.sourceRefs);
  if (left.sourceRefs.some((id) => !laterIds.has(id))) changes.push('source-lost');
  if (right.sourceRefs.some((id) => !previousIds.has(id))) changes.push('source-gained');
  if (!equal([...before.relatedIds].sort(), [...after.relatedIds].sort())) {
    changes.push('dependency-changed');
  }
  if (!equal(before.history, after.history)) changes.push('history-changed');
  if (changes.length === 0) changes.push('same');
  return changes;
}
export function compareIncidentRegisters(earlier, later, options = {}) {
  const first = inspectIncidentRegister(earlier, options);
  const second = inspectIncidentRegister(later, options);
  const problems = [
    ...first.problems.map((value) => ({ ...value, snapshot: 'earlier' })),
    ...second.problems.map((value) => ({ ...value, snapshot: 'later' })),
  ];
  if (problems.length) return { ok: false, changes: [], summary: null, problems };
  const earlierById = new Map(earlier.incidents.map((entry) => [entry.id, entry]));
  const laterById = new Map(later.incidents.map((entry) => [entry.id, entry]));
  const ids = [...new Set([...earlierById.keys(), ...laterById.keys()])].sort();
  const changes = [];
  for (const id of ids) {
    const before = earlierById.get(id);
    const after = laterById.get(id);
    const kinds = !before ? ['added'] : !after ? ['removed'] : changesForIncident(before, after);
    for (const kind of kinds) {
      changes.push({ id, kind, beforeHash: before ? fingerprintEntry(before) : null,
        afterHash: after ? fingerprintEntry(after) : null,
        severity: after?.severity ?? before?.severity ?? null,
        claimState: 'UNKNOWN' });
    }
  }
  const counts = Object.fromEntries(DELTA_KINDS.map((kind) => [kind, 0]));
  for (const change of changes) counts[change.kind] += 1;
  const unsafe = changes.some((entry) => entry.kind === 'removed' ||
    entry.kind === 'source-lost' || entry.kind === 'source-changed' ||
    entry.kind === 'severity-changed');
  return { ok: true, changes, problems: [], summary: {
    counts, recordsBefore: earlier.incidents.length,
    recordsAfter: later.incidents.length, needsHumanReview: unsafe,
    earliestFingerprint: incidentFingerprint(earlier, options).fingerprint,
    latestFingerprint: incidentFingerprint(later, options).fingerprint,
    claimState: 'UNKNOWN',
  } };
}
export function filterIncidentChanges(comparison, options = {}) {
  if (!comparison?.ok || !Array.isArray(comparison.changes)) {
    return { ok: false, items: [], problems: [problem('COMPARISON_INVALID', '/')] };
  }
  const kinds = options.kinds === undefined ? null : options.kinds;
  if (kinds !== null && (!Array.isArray(kinds) || kinds.some((kind) => !kindSet.has(kind)))) {
    return { ok: false, items: [], problems: [problem('KIND_FILTER', '/kinds')] };
  }
  const severity = options.severity;
  if (severity !== undefined && !Object.hasOwn(priority, severity)) {
    return { ok: false, items: [], problems: [problem('SEVERITY_FILTER', '/severity')] };
  }
  const from = options.from ?? 0;
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(limit) ||
      limit < 1 || limit > 500) {
    return { ok: false, items: [], problems: [problem('PAGE_INVALID', '/page')] };
  }
  let items = comparison.changes.filter((item) =>
    (kinds === null || kinds.includes(item.kind)) &&
    (severity === undefined || item.severity === severity));
  if (options.sort === 'severity') {
    items = items.sort((a, b) => priority[a.severity] - priority[b.severity] ||
      a.id.localeCompare(b.id, 'en') || a.kind.localeCompare(b.kind, 'en'));
  } else if (options.sort !== undefined && options.sort !== 'id') {
    return { ok: false, items: [], problems: [problem('SORT_INVALID', '/sort')] };
  }
  return { ok: true, items: items.slice(from, from + limit), total: items.length,
    next: from + limit < items.length ? from + limit : null, problems: [] };
}
export function compareIncidentHistories(earlier, later, options = {}) {
  const compared = compareIncidentRegisters(earlier, later, options);
  if (!compared.ok) return { ok: false, items: [], problems: compared.problems };
  const first = new Map(earlier.incidents.map((entry) => [entry.id, entry]));
  const results = [];
  for (const item of later.incidents) {
    const previous = first.get(item.id);
    if (!previous) {
      results.push({ id: item.id, kind: 'new-history', events: item.history.length });
      continue;
    }
    const beforeHistory = JSON.stringify(previous.history);
    const afterHistory = JSON.stringify(item.history.slice(0, previous.history.length));
    if (beforeHistory !== afterHistory) {
      results.push({ id: item.id, kind: 'rewritten-history', events: 0 });
    } else if (item.history.length > previous.history.length) {
      results.push({ id: item.id, kind: 'appended-history',
        events: item.history.length - previous.history.length });
    } else if (item.history.length < previous.history.length) {
      results.push({ id: item.id, kind: 'truncated-history', events: 0 });
    }
  }
  for (const item of earlier.incidents) {
    if (!later.incidents.some((entry) => entry.id === item.id)) {
      results.push({ id: item.id, kind: 'removed-history', events: item.history.length });
    }
  }
  return { ok: true, items: results.sort((a, b) => a.id.localeCompare(b.id, 'en')),
    problems: [], claimState: 'UNKNOWN' };
}
export function assessIncidentRegression(earlier, later, options = {}) {
  const compared = compareIncidentRegisters(earlier, later, options);
  if (!compared.ok) return { ok: false, blocked: true, reasons: [], problems: compared.problems };
  const earlierMap = new Map(earlier.incidents.map((entry) => [entry.id, entry]));
  const reasons = [];
  for (const current of later.incidents) {
    const previous = earlierMap.get(current.id);
    if (!previous) {
      if (['critical', 'high'].includes(current.severity)) {
        reasons.push({ id: current.id, reason: 'NEW_SEVERE_INCIDENT' });
      }
      continue;
    }
    if (priority[current.severity] < priority[previous.severity]) {
      reasons.push({ id: current.id, reason: 'SEVERITY_INCREASED' });
    }
    if (previous.status === 'resolved' && current.status === 'open') {
      reasons.push({ id: current.id, reason: 'REOPENED' });
    }
    if (changesForIncident(previous, current).includes('source-lost')) {
      reasons.push({ id: current.id, reason: 'EVIDENCE_LOST' });
    }
  }
  for (const previous of earlier.incidents) {
    if (!later.incidents.some((current) => current.id === previous.id) &&
        previous.status !== 'closed') {
      reasons.push({ id: previous.id, reason: 'OPEN_INCIDENT_REMOVED' });
    }
  }
  reasons.sort((a, b) => a.id.localeCompare(b.id, 'en') || a.reason.localeCompare(b.reason, 'en'));
  return { ok: true, blocked: reasons.length > 0, reasons, problems: [], claimState: 'UNKNOWN' };
}

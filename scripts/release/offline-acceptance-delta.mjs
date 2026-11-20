/**
 * Read-only comparison of offline release check ledgers. A test result can
 * change; this does not create evidence of a physical accessibility feature.
 */
import { canonicalAcceptanceLedger, acceptanceFingerprint } from './offline-acceptance-ledger.mjs';

export const DELTA_KINDS = Object.freeze([
  'route-added', 'route-removed', 'route-path', 'route-label',
  'check-added', 'check-removed', 'state-changed', 'unknown-transition',
  'evidence-source', 'evidence-licence', 'evidence-date',
  'evidence-tier', 'evidence-run', 'evidence-digest',
  'check-kind', 'check-label', 'review-link', 'note-changed',
]);
const PRIORITY = Object.freeze({
  'route-added': 1, 'route-removed': 1, 'check-removed': 1,
  'unknown-transition': 1, 'state-changed': 1, 'evidence-source': 1,
  'evidence-licence': 1, 'evidence-date': 2, 'evidence-tier': 1,
  'evidence-run': 2, 'evidence-digest': 2, 'check-added': 2,
  'route-path': 2, 'route-label': 3, 'check-kind': 2,
  'check-label': 3, 'review-link': 2, 'note-changed': 3,
});
function failure(code, path) { return { code, path }; }
function map(items) { return new Map(items.map((entry) => [entry.id, entry])); }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function push(changes, routeId, checkId, kind, before, after) {
  changes.push({ routeId, checkId, kind, priority: PRIORITY[kind],
    before: before ?? null, after: after ?? null });
}
function normalizedCheck(check) {
  return { id: check.id, kind: check.kind, state: check.state,
    label: check.label, evidence: check.evidence,
    reviewItemId: check.reviewItemId ?? null, note: check.note ?? null };
}

function compareCheck(changes, routeId, old, current) {
  if (old.kind !== current.kind) push(changes, routeId, old.id, 'check-kind', old.kind, current.kind);
  if (!equal(old.label, current.label)) push(changes, routeId, old.id, 'check-label', old.label, current.label);
  if (old.state !== current.state) {
    push(changes, routeId, old.id,
      old.state === 'UNKNOWN' || current.state === 'UNKNOWN' ? 'unknown-transition' : 'state-changed',
      old.state, current.state);
  }
  for (const [field, kind] of [
    ['source', 'evidence-source'], ['licence', 'evidence-licence'],
    ['retrievedOn', 'evidence-date'], ['tier', 'evidence-tier'],
    ['runId', 'evidence-run'], ['artifactSha256', 'evidence-digest'],
  ]) {
    if (old.evidence[field] !== current.evidence[field]) {
      // URLs and identifiers are public source metadata, not user content.
      push(changes, routeId, old.id, kind, old.evidence[field], current.evidence[field]);
    }
  }
  if (old.reviewItemId !== current.reviewItemId) {
    push(changes, routeId, old.id, 'review-link', old.reviewItemId, current.reviewItemId);
  }
  if (!equal(old.note, current.note)) push(changes, routeId, old.id, 'note-changed', old.note, current.note);
}

/** Deterministic, bounded changes, independent of route ordering. */
export function compareAcceptanceLedgers(before, after, options = {}) {
  const a = canonicalAcceptanceLedger(before, options);
  const b = canonicalAcceptanceLedger(after, options);
  const problems = [...a.problems.map((problem) => ({ ...problem, snapshot: 'before' })),
    ...b.problems.map((problem) => ({ ...problem, snapshot: 'after' }))];
  if (problems.length) return { ok: false, problems, changes: [], summary: null };
  const changes = [];
  const oldRoutes = map(a.canonical.routes);
  const newRoutes = map(b.canonical.routes);
  const ids = [...new Set([...oldRoutes.keys(), ...newRoutes.keys()])].sort();
  for (const id of ids) {
    const old = oldRoutes.get(id);
    const current = newRoutes.get(id);
    if (!old) {
      push(changes, id, null, 'route-added', null, current.path);
      continue;
    }
    if (!current) {
      push(changes, id, null, 'route-removed', old.path, null);
      continue;
    }
    if (old.path !== current.path) push(changes, id, null, 'route-path', old.path, current.path);
    if (!equal(old.label, current.label)) push(changes, id, null, 'route-label', old.label, current.label);
    const oldChecks = map(old.checks);
    const newChecks = map(current.checks);
    const keys = [...new Set([...oldChecks.keys(), ...newChecks.keys()])].sort();
    for (const key of keys) {
      const previous = oldChecks.get(key);
      const next = newChecks.get(key);
      if (!previous) push(changes, id, key, 'check-added', null, normalizedCheck(next));
      else if (!next) push(changes, id, key, 'check-removed', normalizedCheck(previous), null);
      else compareCheck(changes, id, previous, next);
    }
  }
  changes.sort((x, y) => x.routeId.localeCompare(y.routeId, 'en') ||
    String(x.checkId ?? '').localeCompare(String(y.checkId ?? ''), 'en') ||
    x.kind.localeCompare(y.kind, 'en'));
  const byKind = Object.fromEntries(DELTA_KINDS.map((kind) => [kind, 0]));
  const priorities = { 1: 0, 2: 0, 3: 0 };
  for (const change of changes) {
    byKind[change.kind] += 1;
    priorities[change.priority] += 1;
  }
  return { ok: true, problems: [], changes, summary: {
    total: changes.length, byKind, priorities,
    requiresHumanReview: changes.some((change) => change.priority <= 2),
  } };
}

/** A bounded approval guard compares the complete ledger bytes semantically. */
export function guardAcceptanceChange(before, after, expectedFingerprint, options = {}) {
  const original = acceptanceFingerprint(before, options);
  const later = acceptanceFingerprint(after, options);
  const delta = compareAcceptanceLedgers(before, after, options);
  const problems = [...original.problems, ...later.problems, ...delta.problems];
  if (!original.ok || !later.ok || !delta.ok) {
    return { ok: false, problems, delta: null };
  }
  if (typeof expectedFingerprint !== 'string' || expectedFingerprint !== original.fingerprint) {
    problems.push(failure('BASE_MISMATCH', '/expectedFingerprint'));
  }
  if (later.fingerprint === original.fingerprint && delta.changes.length) {
    problems.push(failure('FINGERPRINT_COLLISION', '/'));
  }
  return { ok: !problems.length, problems, delta: problems.length ? null : delta,
    beforeFingerprint: original.fingerprint, afterFingerprint: later.fingerprint };
}

/** Return a small text-free change index, for privacy-preserving release logs. */
export function acceptanceChangeIndex(result) {
  if (!result?.ok) return null;
  return result.changes.map((row) => ({
    routeId: row.routeId, checkId: row.checkId,
    kind: row.kind, priority: row.priority,
  }));
}

/** Explicit Unknown transitions are never reclassified as successes. */
export function unknownTransitionCount(result) {
  if (!result?.ok) return null;
  return result.changes.filter((change) => change.kind === 'unknown-transition').length;
}

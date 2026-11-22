/** Compare records without confusing changed observations with an inspected website. */
import { entryKey, validateManifest, UNKNOWN, canonicalDestination } from './reference-contract.mjs';
const FIELDS = ['route', 'label', 'destination', 'purpose', 'source', 'licence', 'retrievedOn', 'tier', 'status', 'observedOn', 'note', 'pairId'];
const RISK = { AVAILABLE: 0, UNKNOWN: 1, UNAVAILABLE: 2 };
export function changedFields(before, after) {
  return FIELDS.filter(field => (before[field] ?? null) !== (after[field] ?? null));
}
function classification(before, after, fields) {
  if (fields.length === 0) return 'unchanged';
  if (before.status === UNKNOWN || after.status === UNKNOWN) return 'indeterminate';
  if (RISK[after.status] > RISK[before.status]) return 'recorded-regression';
  if (RISK[after.status] < RISK[before.status]) return 'recorded-improvement';
  if (fields.some(key => ['destination', 'route', 'purpose', 'source', 'licence', 'tier'].includes(key))) return 'needs-review';
  return 'metadata-only';
}
export function compareReferenceSets(before, after, { today = '2026-11-21' } = {}) {
  const v1 = validateManifest(before, { today });
  const v2 = validateManifest(after, { today });
  if (!v1.ok || !v2.ok) return { ok: false, problems: [...v1.problems.map(x => `before:${x}`), ...v2.problems.map(x => `after:${x}`)] };
  const left = new Map(before.references.map(item => [entryKey(item), item]));
  const right = new Map(after.references.map(item => [entryKey(item), item]));
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  const changes = [];
  for (const id of keys) {
    const prior = left.get(id);
    const next = right.get(id);
    if (!prior) { changes.push({ id, kind: 'added', classification: 'needs-review', fields: [], from: null, to: next.status }); continue; }
    if (!next) { changes.push({ id, kind: 'removed', classification: 'needs-review', fields: [], from: prior.status, to: null }); continue; }
    const fields = changedFields(prior, next);
    if (fields.length === 0) continue;
    const destinationChanged = canonicalDestination(prior.destination) !== canonicalDestination(next.destination);
    changes.push({ id, kind: 'modified', classification: classification(prior, next, fields), fields, from: prior.status, to: next.status, destinationChanged });
  }
  const counters = { added: 0, removed: 0, modified: 0, 'recorded-regression': 0, 'recorded-improvement': 0, indeterminate: 0, 'needs-review': 0, 'metadata-only': 0 };
  for (const change of changes) {
    counters[change.kind]++;
    if (change.classification in counters) counters[change.classification]++;
  }
  return { ok: true, value: { beforeDate: before.capturedOn, afterDate: after.capturedOn, totalBefore: before.references.length, totalAfter: after.references.length, counters, changes } };
}
export function proposedReviewItems(delta) {
  if (!delta || !Array.isArray(delta.changes)) return [];
  return delta.changes.filter(change => change.kind !== 'modified' || ['recorded-regression', 'indeterminate', 'needs-review'].includes(change.classification));
}
export function changeMatrix(delta) {
  const matrix = Object.create(null);
  if (!delta || !Array.isArray(delta.changes)) return matrix;
  for (const change of delta.changes) {
    const key = change.from === null ? 'ADDED' : change.to === null ? 'REMOVED' : `${change.from}->${change.to}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
  }
  return matrix;
}

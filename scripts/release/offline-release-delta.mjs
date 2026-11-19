/** Conservative release-to-release changes. No changes to underlying claims. */
import { inspectRelease, fingerprintRelease, problem } from './offline-release-contract.mjs';
import { sourceDependents, impactOfAsset } from './offline-release-graph.mjs';

export const DELTA_VERSION = 1;
export const CHANGE_KINDS = Object.freeze([
  'source-added', 'source-removed', 'source-changed', 'source-review-changed',
  'asset-added', 'asset-removed', 'asset-changed', 'asset-cache-changed',
  'asset-state-changed', 'asset-dependencies-changed', 'asset-digest-changed',
  'claim-added', 'claim-removed', 'claim-changed', 'claim-state-changed',
  'claim-source-changed', 'claim-unknown-transition', 'release-notice-changed',
]);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}
export function deepEqual(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
export function mapEntries(items) { return new Map(items.map((item) => [item.id, item])); }
export function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((key) => !deepEqual(before?.[key], after?.[key])).sort((a, b) => a.localeCompare(b, 'en'));
}
export function classifySourceChange(before, after) {
  if (!before) return ['source-added'];
  if (!after) return ['source-removed'];
  if (deepEqual(before, after)) return [];
  if (changedKeys(before, after).every((key) => key === 'review')) return ['source-review-changed'];
  return ['source-changed'];
}
export function classifyAssetChange(before, after) {
  if (!before) return ['asset-added'];
  if (!after) return ['asset-removed'];
  if (deepEqual(before, after)) return [];
  const changes = changedKeys(before, after);
  const kinds = [];
  if (changes.includes('sha256') || changes.includes('size')) kinds.push('asset-digest-changed');
  if (changes.includes('cache')) kinds.push('asset-cache-changed');
  if (changes.includes('state')) kinds.push('asset-state-changed');
  if (changes.includes('dependsOn')) kinds.push('asset-dependencies-changed');
  if (changes.some((value) => !['sha256', 'size', 'cache', 'state', 'dependsOn'].includes(value))) {
    kinds.push('asset-changed');
  }
  return kinds;
}
export function classifyClaimChange(before, after) {
  if (!before) return ['claim-added'];
  if (!after) return ['claim-removed'];
  if (deepEqual(before, after)) return [];
  const changes = changedKeys(before, after);
  const kinds = [];
  if (changes.includes('state')) {
    kinds.push(before.state === 'UNKNOWN' || after.state === 'UNKNOWN' ?
      'claim-unknown-transition' : 'claim-state-changed');
  }
  if (changes.includes('sourceIds')) kinds.push('claim-source-changed');
  if (changes.some((value) => !['state', 'sourceIds'].includes(value))) kinds.push('claim-changed');
  return kinds;
}
function listDelta(before, after, prefix, classify) {
  const previous = mapEntries(before);
  const next = mapEntries(after);
  const ids = [...new Set([...previous.keys(), ...next.keys()])].sort((a, b) => a.localeCompare(b, 'en'));
  const changes = [];
  for (const id of ids) {
    const left = previous.get(id);
    const right = next.get(id);
    for (const kind of classify(left, right)) {
      changes.push({ kind, category: prefix, id, keys: changedKeys(left, right) });
    }
  }
  return changes;
}
export function compareRelease(before, after, options = {}) {
  const left = inspectRelease(before, options);
  const right = inspectRelease(after, options);
  const issues = [
    ...left.issues.map((value) => ({ ...value, side: 'before' })),
    ...right.issues.map((value) => ({ ...value, side: 'after' })),
  ];
  if (issues.length) return { ok: false, issues, changes: [], summary: null };
  const changes = [
    ...listDelta(before.sources, after.sources, 'sources', classifySourceChange),
    ...listDelta(before.assets, after.assets, 'assets', classifyAssetChange),
    ...listDelta(before.claims, after.claims, 'claims', classifyClaimChange),
  ];
  if (!deepEqual(before.notice, after.notice)) {
    changes.push({ kind: 'release-notice-changed', category: 'release', id: after.releaseId, keys: ['notice'] });
  }
  changes.sort((a, b) => a.category.localeCompare(b.category, 'en') ||
    a.id.localeCompare(b.id, 'en') || a.kind.localeCompare(b.kind, 'en'));
  const kinds = Object.fromEntries(CHANGE_KINDS.map((kind) => [kind, 0]));
  for (const change of changes) kinds[change.kind] += 1;
  const summary = { before: before.releaseId, after: after.releaseId,
    total: changes.length, kinds, added: changes.filter((change) => change.kind.endsWith('-added')).length,
    removed: changes.filter((change) => change.kind.endsWith('-removed')).length,
    unknownTransitions: kinds['claim-unknown-transition'] };
  return { ok: true, issues: [], changes, summary };
}
export function sourceChangeImpact(before, after, options = {}) {
  const compared = compareRelease(before, after, options);
  if (!compared.ok) return { ...compared, impacted: null };
  const impacted = [];
  for (const change of compared.changes.filter((entry) => entry.category === 'sources')) {
    const left = before.sources.find((source) => source.id === change.id);
    const right = after.sources.find((source) => source.id === change.id);
    const oldClaims = left ? sourceDependents(before, change.id, options).claims : [];
    const newClaims = right ? sourceDependents(after, change.id, options).claims : [];
    const ids = [...new Set([...oldClaims, ...newClaims].map((claim) => claim.id))]
      .sort((a, b) => a.localeCompare(b, 'en'));
    impacted.push({ sourceId: change.id, change: change.kind, claimIds: ids, count: ids.length });
  }
  return { ok: true, issues: [], impacted, count: impacted.reduce((sum, item) => sum + item.count, 0) };
}
export function assetChangeImpact(before, after, options = {}) {
  const compared = compareRelease(before, after, options);
  if (!compared.ok) return { ...compared, impacted: null };
  const impacted = [];
  for (const change of compared.changes.filter((entry) => entry.category === 'assets')) {
    const left = before.assets.find((asset) => asset.id === change.id);
    const right = after.assets.find((asset) => asset.id === change.id);
    const oldItems = left ? impactOfAsset(before, change.id, options).affected : [];
    const newItems = right ? impactOfAsset(after, change.id, options).affected : [];
    const dependentIds = [...new Set([...oldItems, ...newItems])].sort((a, b) => a.localeCompare(b, 'en'));
    impacted.push({ assetId: change.id, change: change.kind, dependentIds });
  }
  return { ok: true, issues: [], impacted };
}
export function reviewRequiredChanges(before, after, options = {}) {
  const compared = compareRelease(before, after, options);
  if (!compared.ok) return { ok: false, issues: compared.issues, required: [] };
  const flagged = new Set([
    'source-removed', 'source-changed', 'source-review-changed',
    'asset-removed', 'asset-digest-changed', 'asset-state-changed',
    'asset-dependencies-changed', 'claim-removed', 'claim-changed',
    'claim-state-changed', 'claim-unknown-transition', 'claim-source-changed',
  ]);
  const required = compared.changes.filter((change) => flagged.has(change.kind));
  return { ok: true, issues: [], required, count: required.length };
}
export function guardedReleaseComparison(before, after, expectedFingerprint, options = {}) {
  const fingerprint = fingerprintRelease(before, options);
  if (!fingerprint.ok) return { ok: false, issues: fingerprint.issues, changes: [] };
  if (fingerprint.fingerprint !== expectedFingerprint) {
    return { ok: false, issues: [problem('FINGERPRINT_MISMATCH', '/expectedFingerprint')], changes: [] };
  }
  return compareRelease(before, after, options);
}
export function releaseContinuity(before, after, options = {}) {
  const compared = compareRelease(before, after, options);
  if (!compared.ok) return { ok: false, issues: compared.issues, continuity: null };
  const oldAssets = new Map(before.assets.map((asset) => [asset.path, asset]));
  const newAssets = new Map(after.assets.map((asset) => [asset.path, asset]));
  const preserved = [];
  const replaced = [];
  const removed = [];
  for (const [path, oldAsset] of oldAssets) {
    const candidate = newAssets.get(path);
    if (!candidate) removed.push(path);
    else if (candidate.sha256 !== oldAsset.sha256) replaced.push(path);
    else preserved.push(path);
  }
  const added = [...newAssets.keys()].filter((path) => !oldAssets.has(path));
  return { ok: true, issues: [], continuity: {
    preserved: preserved.sort(), replaced: replaced.sort(), removed: removed.sort(), added: added.sort(),
  } };
}
export function compareClaimCoverage(before, after, options = {}) {
  const compared = compareRelease(before, after, options);
  if (!compared.ok) return { ok: false, issues: compared.issues, changes: null };
  const coverage = (release) => Object.fromEntries(['YES', 'NO', 'UNKNOWN'].map((state) =>
    [state, release.claims.filter((claim) => claim.state === state).length]));
  const oldCoverage = coverage(before);
  const newCoverage = coverage(after);
  const shifts = Object.fromEntries(Object.keys(oldCoverage).map((state) =>
    [state, newCoverage[state] - oldCoverage[state]]));
  return { ok: true, issues: [], changes: { before: oldCoverage, after: newCoverage, shifts } };
}
export function compareSourceLicences(before, after, options = {}) {
  const compared = compareRelease(before, after, options);
  if (!compared.ok) return { ok: false, issues: compared.issues, changes: [] };
  const previous = mapEntries(before.sources);
  const changes = after.sources.filter((source) => previous.has(source.id) &&
    previous.get(source.id).licence !== source.licence)
    .map((source) => ({ id: source.id, before: previous.get(source.id).licence, after: source.licence }));
  return { ok: true, issues: [], changes: changes.sort((a, b) => a.id.localeCompare(b.id, 'en')) };
}
export function compareRetrievalDates(before, after, options = {}) {
  const compared = compareRelease(before, after, options);
  if (!compared.ok) return { ok: false, issues: compared.issues, dates: [] };
  const previous = mapEntries(before.sources);
  const dates = after.sources.filter((source) => previous.has(source.id) &&
    previous.get(source.id).retrievedOn !== source.retrievedOn)
    .map((source) => ({ id: source.id, oldDate: previous.get(source.id).retrievedOn,
      newDate: source.retrievedOn, newer: source.retrievedOn > previous.get(source.id).retrievedOn }));
  return { ok: true, issues: [], dates: dates.sort((a, b) => a.id.localeCompare(b.id, 'en')) };
}

/** Deterministic comparison of two complete offline release inventories. */
import { inspectPrecache, precacheFingerprint } from './precache-contract.mjs';
export const PRECACHE_CHANGES = Object.freeze([
  'added', 'removed', 'state-changed', 'hash-changed', 'bytes-changed',
  'source-changed', 'licence-changed', 'date-changed', 'tier-changed',
  'locale-changed', 'group-changed', 'path-changed', 'kind-changed',
  'dependencies-changed', 'label-changed',
]);
function issue(code, path) { return { code, path }; }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function sortedReferences(value) { return [...value].sort((a, b) => a.localeCompare(b, 'en')); }
function summaryOf(changes) {
  const byKind = Object.fromEntries(PRECACHE_CHANGES.map(name => [name, 0]));
  const byGroup = { shell: 0, 'offline-pack': 0, route: 0, optional: 0 };
  const byLocale = { en: 0, fr: 0, neutral: 0 };
  for (const change of changes) {
    byKind[change.kind]++;
    const group = change.after?.group ?? change.before?.group;
    const locale = change.after?.locale ?? change.before?.locale;
    if (Object.hasOwn(byGroup, group)) byGroup[group]++;
    if (Object.hasOwn(byLocale, locale)) byLocale[locale]++;
  }
  return { total: changes.length, byKind, byGroup, byLocale };
}
export function differencesForAsset(before, after) {
  const changes = [];
  const keys = [
    ['state', 'state-changed'], ['sha256', 'hash-changed'],
    ['bytes', 'bytes-changed'], ['source', 'source-changed'],
    ['licence', 'licence-changed'], ['retrievedOn', 'date-changed'],
    ['tier', 'tier-changed'], ['locale', 'locale-changed'],
    ['group', 'group-changed'], ['path', 'path-changed'],
    ['kind', 'kind-changed'],
  ];
  for (const [key, kind] of keys) {
    if (before[key] !== after[key]) changes.push(kind);
  }
  if (!equal(sortedReferences(before.dependsOn), sortedReferences(after.dependsOn))) {
    changes.push('dependencies-changed');
  }
  if (!equal(before.label, after.label)) changes.push('label-changed');
  return changes;
}
function compactAsset(asset) {
  if (!asset) return null;
  return {
    id: asset.id, path: asset.path, group: asset.group, locale: asset.locale,
    state: asset.state, bytes: asset.bytes, sha256: asset.sha256,
    source: asset.source, licence: asset.licence,
    retrievedOn: asset.retrievedOn, tier: asset.tier,
  };
}
export function comparePrecache(before, after, options = {}) {
  const a = inspectPrecache(before, options);
  const b = inspectPrecache(after, options);
  const errors = [
    ...a.errors.map(value => ({ ...value, side: 'before' })),
    ...b.errors.map(value => ({ ...value, side: 'after' })),
  ];
  if (errors.length) return { ok: false, errors, changes: [], summary: null, fingerprints: null };
  const left = new Map(before.assets.map(asset => [asset.id, asset]));
  const right = new Map(after.assets.map(asset => [asset.id, asset]));
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a.localeCompare(b, 'en'));
  const changes = [];
  for (const id of ids) {
    const aAsset = left.get(id);
    const bAsset = right.get(id);
    if (!aAsset) {
      changes.push({ id, kind: 'added', before: null, after: compactAsset(bAsset) });
      continue;
    }
    if (!bAsset) {
      changes.push({ id, kind: 'removed', before: compactAsset(aAsset), after: null });
      continue;
    }
    for (const kind of differencesForAsset(aAsset, bAsset)) {
      changes.push({ id, kind, before: compactAsset(aAsset), after: compactAsset(bAsset) });
    }
  }
  const hashes = {
    before: precacheFingerprint(before, options).hash,
    after: precacheFingerprint(after, options).hash,
  };
  return { ok: true, errors: [], changes, summary: summaryOf(changes), fingerprints: hashes };
}
export function affectedDependents(manifest, changedIds, options = {}) {
  const checked = inspectPrecache(manifest, options);
  if (!checked.ok) return { ok: false, errors: checked.errors, affected: [] };
  const seeds = new Set(changedIds);
  const known = new Set(manifest.assets.map(asset => asset.id));
  if ([...seeds].some(id => !known.has(id))) return { ok: false, errors: [issue('UNKNOWN_SEED', '/changedIds')], affected: [] };
  const parents = new Map();
  for (const asset of manifest.assets) {
    for (const ref of asset.dependsOn) {
      if (!parents.has(ref)) parents.set(ref, []);
      parents.get(ref).push(asset.id);
    }
  }
  const seen = new Set(seeds);
  const queue = [...seeds];
  const affected = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const parent of parents.get(queue[cursor]) ?? []) {
      if (seen.has(parent)) continue;
      seen.add(parent);
      affected.push(parent);
      queue.push(parent);
    }
  }
  return { ok: true, errors: [], affected: affected.sort((a, b) => a.localeCompare(b, 'en')) };
}
export function releaseImpact(before, after, options = {}) {
  const delta = comparePrecache(before, after, options);
  if (!delta.ok) return { ok: false, errors: delta.errors, changed: [], affected: [], summary: null };
  const ids = [...new Set(delta.changes.map(change => change.id))];
  const validCurrent = new Set(after.assets.map(asset => asset.id));
  const relevant = ids.filter(id => validCurrent.has(id));
  const linked = affectedDependents(after, relevant, options);
  return {
    ok: linked.ok, errors: linked.errors,
    changed: ids, affected: linked.affected,
    summary: { directlyChanged: ids.length, dependents: linked.affected.length },
  };
}
export function policyDelta(before, after, options = {}) {
  const delta = comparePrecache(before, after, options);
  if (!delta.ok) return { ok: false, errors: delta.errors, review: [] };
  const urgent = new Set(['removed', 'state-changed', 'hash-changed', 'source-changed',
    'licence-changed', 'tier-changed', 'bytes-changed', 'dependencies-changed']);
  const review = delta.changes.filter(item => urgent.has(item.kind)).map(item => ({
    id: item.id, kind: item.kind, state: 'UNKNOWN',
    source: item.after?.source ?? item.before?.source ?? null,
    licence: item.after?.licence ?? item.before?.licence ?? null,
    retrievedOn: item.after?.retrievedOn ?? item.before?.retrievedOn ?? null,
    tier: item.after?.tier ?? item.before?.tier ?? null,
  }));
  return { ok: true, errors: [], review };
}

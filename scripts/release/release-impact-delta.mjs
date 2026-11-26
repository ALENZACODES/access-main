/** Stable before/after release comparisons. Missing or changed evidence stays review-only. */
import { checkManifest, UNKNOWN } from './release-impact-contract.mjs';
import { entryPoints, graphReview, impactFor, indexAssets } from './release-impact-graph.mjs';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = items => items.sort((a, b) => compare(a.id, b.id));
export function assetChanges(before, after) {
  const left = indexAssets(before);
  const right = indexAssets(after);
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  return ids.map(id => {
    const old = left.get(id);
    const current = right.get(id);
    if (!old) return { id, kind: 'added', previous: null, current };
    if (!current) return { id, kind: 'removed', previous: old, current: null };
    const changed = [];
    for (const key of ['path', 'sha256', 'bytes', 'kind', 'locale', 'entry', 'source', 'licence', 'retrievedOn', 'tier']) {
      if (old[key] !== current[key]) changed.push(key);
    }
    if (old.dependsOn.join('\0') !== current.dependsOn.join('\0')) {
      if (old.dependsOn.length !== current.dependsOn.length || [...old.dependsOn].sort().join('|') !== [...current.dependsOn].sort().join('|')) changed.push('dependsOn');
    }
    return { id, kind: changed.length ? 'changed' : 'unchanged', previous: old, current, fields: changed };
  });
}
export function movedPaths(before, after) {
  return assetChanges(before, after).filter(row => row.previous?.path !== undefined && row.current?.path !== undefined &&
    row.previous.path !== row.current.path).map(row => ({ id: row.id, before: row.previous.path, after: row.current.path }));
}
export function digestChanges(before, after) {
  return assetChanges(before, after).filter(row => row.previous && row.current && row.previous.sha256 !== row.current.sha256).map(row => ({
    id: row.id, before: row.previous.sha256, after: row.current.sha256,
  }));
}
export function permissionChanges(before, after) {
  return assetChanges(before, after).filter(row => row.previous && row.current &&
    (row.previous.source !== row.current.source || row.previous.licence !== row.current.licence ||
      row.previous.tier !== row.current.tier || row.previous.retrievedOn !== row.current.retrievedOn)).map(row => ({
    id: row.id,
    sourceChanged: row.previous.source !== row.current.source,
    licenceChanged: row.previous.licence !== row.current.licence,
    tierChanged: row.previous.tier !== row.current.tier,
    dateChanged: row.previous.retrievedOn !== row.current.retrievedOn,
  }));
}
export function dependencyChanges(before, after) {
  return assetChanges(before, after).filter(row => row.previous && row.current &&
    row.fields?.includes('dependsOn')).map(row => ({
    id: row.id,
    added: row.current.dependsOn.filter(dep => !row.previous.dependsOn.includes(dep)).sort(),
    removed: row.previous.dependsOn.filter(dep => !row.current.dependsOn.includes(dep)).sort(),
  }));
}
export function impactReview(before, after) {
  const left = indexAssets(before);
  const right = indexAssets(after);
  const changes = assetChanges(before, after).filter(row => row.kind !== 'unchanged');
  return sorted(changes.map(row => {
    const impactedBefore = left.has(row.id) ? impactFor(before, row.id).impactedEntries : [];
    const impactedAfter = right.has(row.id) ? impactFor(after, row.id).impactedEntries : [];
    const affected = [...new Set([...impactedBefore, ...impactedAfter])].sort();
    const removed = row.kind === 'removed';
    const provenanceUnknown = row.current?.tier === UNKNOWN || row.previous?.tier === UNKNOWN;
    return {
      id: row.id, kind: row.kind, fields: row.fields ?? [], impactedEntries: affected,
      priority: removed && affected.length ? 'critical' : affected.length ? 'review' : 'information',
      evidence: provenanceUnknown ? UNKNOWN : 'documented',
      beforeBytes: row.previous?.bytes ?? 0, afterBytes: row.current?.bytes ?? 0,
      byteDelta: (row.current?.bytes ?? 0) - (row.previous?.bytes ?? 0),
    };
  }));
}
export function compareManifest(before, after, { today = '9999-12-31' } = {}) {
  const old = checkManifest(before, { today });
  const current = checkManifest(after, { today });
  if (!old.ok || !current.ok) return { ok: false, issues: [...(!old.ok ? old.issues.map(item => ({ ...item, path: `before${item.path}` })) : []),
    ...(!current.ok ? current.issues.map(item => ({ ...item, path: `after${item.path}` })) : [])] };
  const a = old.value;
  const b = current.value;
  const changes = assetChanges(a, b);
  const items = impactReview(a, b);
  const reviewA = graphReview(a).value;
  const reviewB = graphReview(b).value;
  return { ok: true, value: {
    before: a.createdOn, after: b.createdOn, items,
    added: changes.filter(row => row.kind === 'added').map(row => row.id),
    removed: changes.filter(row => row.kind === 'removed').map(row => row.id),
    changed: changes.filter(row => row.kind === 'changed').map(row => row.id),
    unchanged: changes.filter(row => row.kind === 'unchanged').map(row => row.id),
    moved: movedPaths(a, b), hashes: digestChanges(a, b), dependencies: dependencyChanges(a, b), provenance: permissionChanges(a, b),
    rootChanges: { added: entryPoints(b).filter(id => !entryPoints(a).includes(id)), removed: entryPoints(a).filter(id => !entryPoints(b).includes(id)) },
    orphanChanges: { added: reviewB.orphans.filter(id => !reviewA.orphans.includes(id)), removed: reviewA.orphans.filter(id => !reviewB.orphans.includes(id)) },
    cycles: { before: reviewA.cycles, after: reviewB.cycles },
    counts: { before: a.assets.length, after: b.assets.length },
    totalBytes: { before: a.assets.reduce((n, row) => n + row.bytes, 0), after: b.assets.reduce((n, row) => n + row.bytes, 0) },
    warning: 'Changes are metadata observations, not accessibility conclusions. UNKNOWN stays UNKNOWN.',
  }, issues: [] };
}

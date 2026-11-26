/** Graph reachability and impact analysis over a manifest supplied explicitly by a reviewer. */
import { checkManifest, UNKNOWN } from './release-impact-contract.mjs';
export function indexAssets(manifest) { return new Map(manifest.assets.map(asset => [asset.id, asset])); }
export function reverseEdges(manifest) {
  const parents = new Map(manifest.assets.map(asset => [asset.id, new Set()]));
  for (const asset of manifest.assets) for (const dep of asset.dependsOn) parents.get(dep)?.add(asset.id);
  return new Map([...parents].map(([id, references]) => [id, [...references].sort()]));
}
export function dependencies(manifest, id) {
  const index = indexAssets(manifest);
  if (!index.has(id)) return [];
  const seen = new Set();
  const pending = [...index.get(id).dependsOn];
  while (pending.length) {
    const current = pending.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(index.get(current)?.dependsOn ?? []));
  }
  return [...seen].sort();
}
export function dependants(manifest, id) {
  const parents = reverseEdges(manifest);
  if (!parents.has(id)) return [];
  const visited = new Set();
  const pending = [...parents.get(id)];
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(parents.get(current) ?? []));
  }
  return [...visited].sort();
}
export function entryPoints(manifest) { return manifest.assets.filter(asset => asset.entry).map(asset => asset.id).sort(); }
export function reachable(manifest) {
  const visible = new Set();
  for (const id of entryPoints(manifest)) {
    visible.add(id);
    for (const dep of dependencies(manifest, id)) visible.add(dep);
  }
  return [...visible].sort();
}
export function orphanAssets(manifest) {
  const used = new Set(reachable(manifest));
  return manifest.assets.filter(asset => !used.has(asset.id)).map(asset => asset.id).sort();
}
export function cycles(manifest) {
  const idx = indexAssets(manifest);
  const state = new Map();
  const stack = [];
  const results = new Set();
  const visit = id => {
    state.set(id, 'visiting');
    stack.push(id);
    for (const next of idx.get(id).dependsOn) {
      if (state.get(next) === 'visiting') {
        const slice = stack.slice(stack.indexOf(next));
        const normalized = [...slice].sort().join('|');
        results.add(normalized);
      } else if (!state.has(next)) visit(next);
    }
    stack.pop();
    state.set(id, 'done');
  };
  for (const id of [...idx.keys()].sort()) if (!state.has(id)) visit(id);
  return [...results].sort().map(key => key.split('|'));
}
export function rootCoverage(manifest) {
  return entryPoints(manifest).map(id => {
    const items = [id, ...dependencies(manifest, id)];
    const idx = indexAssets(manifest);
    const bytes = items.reduce((sum, item) => sum + idx.get(item).bytes, 0);
    const unknown = items.filter(item => idx.get(item).tier === UNKNOWN);
    return { id, count: items.length, bytes, unknown, locale: idx.get(id).locale };
  });
}
export function impactFor(manifest, id) {
  const idx = indexAssets(manifest);
  if (!idx.has(id)) return null;
  const downstream = dependants(manifest, id);
  const all = [id, ...downstream];
  const affected = new Set(all);
  return {
    id, path: idx.get(id).path, referencedBy: downstream,
    impactedEntries: entryPoints(manifest).filter(entry => affected.has(entry)),
    entryCount: entryPoints(manifest).filter(entry => affected.has(entry)).length,
    risk: idx.get(id).tier === UNKNOWN ? 'UNKNOWN' : 'needs-review',
  };
}
export function graphReview(manifest, { today = '9999-12-31' } = {}) {
  const checked = checkManifest(manifest, { today });
  if (!checked.ok) return checked;
  const value = checked.value;
  return { ok: true, value: {
    roots: entryPoints(value), orphans: orphanAssets(value), cycles: cycles(value),
    coverage: rootCoverage(value), dependencies: value.assets.reduce((sum, asset) => sum + asset.dependsOn.length, 0),
    unknownTier: value.assets.filter(asset => asset.tier === UNKNOWN).map(asset => asset.id),
    impacted: value.assets.map(asset => impactFor(value, asset.id)),
  }, issues: [] };
}
export function criticalPath(manifest, id) {
  const idx = indexAssets(manifest);
  if (!idx.has(id)) return [];
  const paths = [];
  const traverse = (node, path, seen) => {
    if (seen.has(node)) { paths.push([...path, node]); return; }
    const next = idx.get(node).dependsOn;
    if (next.length === 0) { paths.push([...path, node]); return; }
    for (const dep of next) traverse(dep, [...path, node], new Set([...seen, node]));
  };
  traverse(id, [], new Set());
  return paths.sort((a, b) => b.length - a.length || a.join('|').localeCompare(b.join('|')))[0] ?? [];
}

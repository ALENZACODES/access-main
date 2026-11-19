/** Dependency and availability analysis for a validated offline release. */
import { inspectRelease, problem } from './offline-release-contract.mjs';

export const GRAPH_VERSION = 1;
export const REACHABILITY = Object.freeze(['available', 'unavailable', 'not-cached']);
export const RISK_KINDS = Object.freeze([
  'not-included', 'dependency-unavailable', 'not-cached',
  'orphan-asset', 'unreferenced-source', 'blocked-source',
  'missing-entry', 'oversize-entry', 'hash-reused',
]);
const MAX_TRACE = 128;
const HIGH_WATERMARK = 10_000_000;
function byId(items) { return new Map(items.map((entry) => [entry.id, entry])); }
function sorted(values) { return [...values].sort((a, b) => a.localeCompare(b, 'en')); }
function outcome(ok, issues, detail) { return { ok, issues, ...(ok ? detail : {}) }; }

export function directDependencies(release, id, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const asset = release.assets.find((item) => item.id === id);
  if (!asset) return outcome(false, [problem('GRAPH_ASSET_MISSING', '/id')]);
  return outcome(true, [], { ids: sorted(asset.dependsOn) });
}
export function reverseReferences(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const references = Object.fromEntries(sorted(release.assets.map((asset) => asset.id)).map((id) => [id, []]));
  for (const asset of release.assets) {
    for (const id of asset.dependsOn) references[id].push(asset.id);
  }
  for (const value of Object.values(references)) value.sort((a, b) => a.localeCompare(b, 'en'));
  return outcome(true, [], { references });
}
export function transitiveDependencies(release, id, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const assets = byId(release.assets);
  if (!assets.has(id)) return outcome(false, [problem('GRAPH_ASSET_MISSING', '/id')]);
  const visited = new Set();
  const order = [];
  function walk(current) {
    for (const dep of sorted(assets.get(current).dependsOn)) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      walk(dep);
      order.push(dep);
    }
  }
  walk(id);
  return outcome(true, [], { ids: order, count: order.length });
}
export function impactOfAsset(release, id, options = {}) {
  const reversed = reverseReferences(release, options);
  if (!reversed.ok) return reversed;
  if (!Object.hasOwn(reversed.references, id)) return outcome(false, [problem('GRAPH_ASSET_MISSING', '/id')]);
  const visited = new Set();
  const queue = [id];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const dependent of reversed.references[current]) {
      if (visited.has(dependent)) continue;
      visited.add(dependent);
      queue.push(dependent);
    }
  }
  return outcome(true, [], { affected: sorted(visited), count: visited.size });
}
export function assetAvailability(release, id, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const assets = byId(release.assets);
  const target = assets.get(id);
  if (!target) return outcome(false, [problem('GRAPH_ASSET_MISSING', '/id')]);
  const issues = [];
  const visited = new Set();
  function traverse(current, trail) {
    const asset = assets.get(current);
    if (visited.has(current)) return;
    visited.add(current);
    if (asset.state !== 'included') {
      issues.push({ kind: 'not-included', id: current, path: [...trail, current] });
    } else if (asset.cache === 'not-cached') {
      issues.push({ kind: 'not-cached', id: current, path: [...trail, current] });
    }
    for (const child of asset.dependsOn) traverse(child, [...trail, current]);
  }
  traverse(id, []);
  let state = 'available';
  if (issues.some((issue) => issue.kind === 'not-included')) state = 'unavailable';
  else if (issues.some((issue) => issue.kind === 'not-cached')) state = 'not-cached';
  return outcome(true, [], { state, details: issues, traceCount: visited.size });
}
export function topologicalOrder(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const assets = byId(release.assets);
  const order = [];
  const done = new Set();
  function visit(id) {
    if (done.has(id)) return;
    done.add(id);
    for (const child of sorted(assets.get(id).dependsOn)) visit(child);
    order.push(id);
  }
  for (const id of sorted(assets.keys())) visit(id);
  return outcome(true, [], { order });
}
export function graphLayers(release, options = {}) {
  const order = topologicalOrder(release, options);
  if (!order.ok) return order;
  const assets = byId(release.assets);
  const depth = new Map();
  for (const id of order.order) {
    const dependencies = assets.get(id).dependsOn;
    depth.set(id, dependencies.length === 0 ? 0 : 1 + Math.max(...dependencies.map((child) => depth.get(child))));
  }
  const layers = [];
  for (const id of order.order) {
    const layer = depth.get(id);
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(id);
  }
  for (const layer of layers) layer.sort((a, b) => a.localeCompare(b, 'en'));
  return outcome(true, [], { layers, height: layers.length });
}
export function entryPointAnalysis(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const candidates = release.assets.filter((asset) => asset.kind === 'html' && asset.state === 'included');
  const results = [];
  for (const candidate of candidates) {
    const availability = assetAvailability(release, candidate.id, options);
    results.push({ id: candidate.id, path: candidate.path, state: availability.state,
      dependencyCount: availability.traceCount - 1,
      issues: availability.details.map((value) => ({ kind: value.kind, id: value.id })) });
  }
  results.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return outcome(true, [], { entries: results, availableCount: results.filter((item) => item.state === 'available').length });
}
export function orphanAssets(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const assets = byId(release.assets);
  const roots = release.assets.filter((asset) => asset.kind === 'html' && asset.state === 'included');
  const seen = new Set();
  function walk(id) {
    if (seen.has(id)) return;
    seen.add(id);
    for (const child of assets.get(id).dependsOn) walk(child);
  }
  for (const asset of roots) walk(asset.id);
  const orphans = release.assets.filter((asset) => asset.state === 'included' && !seen.has(asset.id))
    .map((asset) => ({ id: asset.id, path: asset.path, size: asset.size }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return outcome(true, [], { orphans, totalBytes: orphans.reduce((sum, asset) => sum + asset.size, 0) });
}
export function unreferencedSources(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const used = new Set(release.claims.flatMap((claim) => claim.sourceIds));
  const ids = sorted(release.sources.filter((source) => !used.has(source.id)).map((source) => source.id));
  return outcome(true, [], { ids, count: ids.length });
}
export function sourceDependents(release, sourceId, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  if (!release.sources.some((source) => source.id === sourceId)) {
    return outcome(false, [problem('GRAPH_SOURCE_MISSING', '/sourceId')]);
  }
  const claims = release.claims.filter((claim) => claim.sourceIds.includes(sourceId))
    .map((claim) => ({ id: claim.id, recordId: claim.recordId, field: claim.field, state: claim.state }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return outcome(true, [], { claims, count: claims.length });
}
export function blockedSourceImpact(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const blocked = release.sources.filter((source) => source.review === 'blocked');
  const impacted = [];
  for (const source of blocked) {
    const dep = sourceDependents(release, source.id, options);
    impacted.push({ id: source.id, claimIds: dep.claims.map((claim) => claim.id) });
  }
  return outcome(true, [], { impacted: impacted.sort((a, b) => a.id.localeCompare(b.id, 'en')) });
}
export function duplicateDigests(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const grouped = new Map();
  for (const asset of release.assets) {
    if (!grouped.has(asset.sha256)) grouped.set(asset.sha256, []);
    grouped.get(asset.sha256).push(asset.id);
  }
  const duplicates = [];
  for (const [sha256, ids] of grouped) if (ids.length > 1) duplicates.push({ sha256, ids: sorted(ids) });
  return outcome(true, [], { duplicates: duplicates.sort((a, b) => a.sha256.localeCompare(b.sha256)) });
}
export function sizeByKind(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const sizes = {};
  for (const asset of release.assets) {
    if (asset.state !== 'included') continue;
    sizes[asset.kind] = (sizes[asset.kind] ?? 0) + asset.size;
  }
  return outcome(true, [], { sizes: Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b))) });
}
export function sizeByCachePolicy(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const sizes = { precache: 0, 'runtime-local': 0, 'not-cached': 0 };
  for (const asset of release.assets) if (asset.state === 'included') sizes[asset.cache] += asset.size;
  return outcome(true, [], { sizes });
}
export function offlineRiskRegister(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const risks = [];
  const entries = entryPointAnalysis(release, options);
  for (const entry of entries.entries) {
    if (entry.state !== 'available') risks.push({ kind: 'dependency-unavailable', id: entry.id, detail: entry.state });
  }
  const orphans = orphanAssets(release, options);
  for (const asset of orphans.orphans) risks.push({ kind: 'orphan-asset', id: asset.id, detail: asset.path });
  const unused = unreferencedSources(release, options);
  for (const id of unused.ids) risks.push({ kind: 'unreferenced-source', id, detail: '' });
  for (const asset of release.assets) {
    if (asset.state !== 'included') risks.push({ kind: 'not-included', id: asset.id, detail: asset.state });
    if (asset.cache === 'not-cached' && asset.state === 'included') {
      risks.push({ kind: 'not-cached', id: asset.id, detail: asset.path });
    }
    if (asset.size > HIGH_WATERMARK) risks.push({ kind: 'oversize-entry', id: asset.id, detail: String(asset.size) });
  }
  for (const item of blockedSourceImpact(release, options).impacted) {
    risks.push({ kind: 'blocked-source', id: item.id, detail: String(item.claimIds.length) });
  }
  for (const item of duplicateDigests(release, options).duplicates) {
    risks.push({ kind: 'hash-reused', id: item.ids[0], detail: String(item.ids.length) });
  }
  risks.sort((a, b) => a.kind.localeCompare(b.kind, 'en') || a.id.localeCompare(b.id, 'en'));
  return outcome(true, [], { risks, total: risks.length });
}
export function manifestGraphSummary(release, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const entry = entryPointAnalysis(release, options);
  const layers = graphLayers(release, options);
  const unused = unreferencedSources(release, options);
  const sizes = sizeByCachePolicy(release, options);
  const risks = offlineRiskRegister(release, options);
  return outcome(true, [], { summary: {
    entryPoints: entry.entries.length,
    availableEntryPoints: entry.availableCount,
    maximumDependencyLayers: layers.height,
    unusedSources: unused.count,
    cacheBytes: sizes.sizes,
    riskCount: risks.total,
  } });
}
export function boundedDependencyTrace(release, id, options = {}) {
  const check = inspectRelease(release, options);
  if (!check.ok) return outcome(false, check.issues);
  const assets = byId(release.assets);
  if (!assets.has(id)) return outcome(false, [problem('GRAPH_ASSET_MISSING', '/id')]);
  const queue = [{ id, path: [id] }];
  const traces = [];
  const seen = new Set();
  for (let index = 0; index < queue.length && traces.length < MAX_TRACE; index += 1) {
    const next = queue[index];
    if (seen.has(next.id)) continue;
    seen.add(next.id);
    const asset = assets.get(next.id);
    traces.push({ id: next.id, state: asset.state, cache: asset.cache, path: next.path });
    for (const dep of sorted(asset.dependsOn)) queue.push({ id: dep, path: [...next.path, dep] });
  }
  return outcome(true, [], { traces, truncated: queue.length > MAX_TRACE });
}

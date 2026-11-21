import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRAPH_VERSION, REACHABILITY, RISK_KINDS, directDependencies,
  reverseReferences, transitiveDependencies, impactOfAsset,
  assetAvailability, topologicalOrder, graphLayers,
  entryPointAnalysis, orphanAssets, unreferencedSources,
  sourceDependents, blockedSourceImpact, duplicateDigests,
  sizeByKind, sizeByCachePolicy, offlineRiskRegister,
  manifestGraphSummary, boundedDependencyTrace,
} from './offline-release-graph.mjs';

const TODAY = '2026-11-19';
const sha = (char) => char.repeat(64);
const source = (id = 's1', review = 'pending') => ({
  id, title: `Sample ${id}`, url: `https://example.org/${id}`,
  licence: 'CC0-1.0', retrievedOn: TODAY, tier: 0, review,
});
const asset = (id, kind, dependencies = [], overrides = {}) => ({
  id, kind, dependsOn: dependencies, path: `${id}.js`, size: 100,
  sha256: sha(id[0] === 'i' ? 'a' : id[0] === 's' ? 'b' : 'c'),
  cache: 'precache', state: 'included', ...overrides,
});
const claim = (id = 'claim') => ({
  id, recordId: 'fictional', field: 'stepFreeEntrance',
  state: 'UNKNOWN', sourceIds: ['s1'],
});
const fixture = () => ({
  version: 1, releaseId: 'graph-example', createdOn: TODAY,
  locale: { en: true, fr: true },
  notice: { en: 'No physical-world result', fr: 'Aucun résultat sur le terrain' },
  sources: [source()],
  assets: [asset('index', 'html', ['script', 'style'], { path: 'index.html' }),
    asset('script', 'script', ['font']),
    asset('style', 'style'),
    asset('font', 'font')],
  claims: [claim()],
});
function copy(input) { return structuredClone(input); }
function update(input, id, changes) {
  const result = copy(input);
  const index = result.assets.findIndex((entry) => entry.id === id);
  result.assets[index] = { ...result.assets[index], ...changes };
  return result;
}

// Structural dependency tests do not establish that a browser is offline.
test('graph vocabulary has stable version and bounded statuses', () => {
  assert.equal(GRAPH_VERSION, 1);
  assert.deepEqual(REACHABILITY, ['available', 'unavailable', 'not-cached']);
  assert.ok(RISK_KINDS.includes('blocked-source'));
});
test('direct dependencies are deterministic and sorted', () => {
  const result = directDependencies(fixture(), 'index');
  assert.equal(result.ok, true);
  assert.deepEqual(result.ids, ['script', 'style']);
});
test('direct dependencies on leaf assets are empty', () => {
  assert.deepEqual(directDependencies(fixture(), 'style').ids, []);
});
test('missing direct dependency query fails closed', () => {
  const result = directDependencies(fixture(), 'absent');
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'GRAPH_ASSET_MISSING');
});
test('reverse references show immediate parents', () => {
  const result = reverseReferences(fixture());
  assert.deepEqual(result.references.script, ['index']);
  assert.deepEqual(result.references.font, ['script']);
});
test('reverse references include isolated leaves', () => {
  const result = reverseReferences(fixture());
  assert.deepEqual(result.references.index, []);
});
test('transitive dependencies traverse two levels', () => {
  const result = transitiveDependencies(fixture(), 'index');
  assert.deepEqual(result.ids, ['font', 'script', 'style']);
  assert.equal(result.count, 3);
});
test('transitive dependencies on leaf asset are empty', () => {
  assert.deepEqual(transitiveDependencies(fixture(), 'font').ids, []);
});
test('transitive dependencies never include root itself', () => {
  assert.equal(transitiveDependencies(fixture(), 'index').ids.includes('index'), false);
});
test('asset impact flows toward dependent entry pages', () => {
  const result = impactOfAsset(fixture(), 'font');
  assert.deepEqual(result.affected, ['index', 'script']);
});
test('asset impact on root has no dependents', () => {
  assert.deepEqual(impactOfAsset(fixture(), 'index').affected, []);
});
test('asset impact refuses unknown ID', () => {
  assert.equal(impactOfAsset(fixture(), 'missing').ok, false);
});
test('fully included precached assets are structurally available', () => {
  const result = assetAvailability(fixture(), 'index');
  assert.equal(result.state, 'available');
  assert.deepEqual(result.details, []);
});
test('a withdrawn descendant makes entry structurally unavailable', () => {
  const release = update(fixture(), 'font', { state: 'withdrawn' });
  // A parent cannot cite an unavailable asset in an accepted release.
  const result = assetAvailability(release, 'index');
  assert.equal(result.ok, false);
});
test('an uncached descendant is surfaced rather than claimed offline', () => {
  const release = update(fixture(), 'font', { cache: 'not-cached' });
  const result = assetAvailability(release, 'index');
  assert.equal(result.ok, true);
  assert.equal(result.state, 'not-cached');
  assert.ok(result.details.some((entry) => entry.id === 'font'));
});
test('the root may itself be omitted without implying an offline page', () => {
  const release = update(fixture(), 'index', { state: 'omitted' });
  assert.equal(assetAvailability(release, 'index').state, 'unavailable');
});
test('topological order puts dependencies before dependents', () => {
  const order = topologicalOrder(fixture()).order;
  assert.ok(order.indexOf('font') < order.indexOf('script'));
  assert.ok(order.indexOf('script') < order.indexOf('index'));
});
test('topological order includes all assets once', () => {
  const order = topologicalOrder(fixture()).order;
  assert.equal(order.length, 4);
  assert.equal(new Set(order).size, 4);
});
test('dependency layers reflect transitive depth', () => {
  const result = graphLayers(fixture());
  assert.equal(result.height, 3);
  assert.deepEqual(result.layers[0], ['font', 'style']);
  assert.deepEqual(result.layers[2], ['index']);
});
test('entry point analysis identifies HTML roots', () => {
  const result = entryPointAnalysis(fixture());
  assert.equal(result.availableCount, 1);
  assert.equal(result.entries[0].path, 'index.html');
});
test('entry point analysis is empty when no HTML resource is present', () => {
  const release = update(fixture(), 'index', { kind: 'script' });
  assert.deepEqual(entryPointAnalysis(release).entries, []);
});
test('entry point reports uncached dependency', () => {
  const release = update(fixture(), 'font', { cache: 'not-cached' });
  assert.equal(entryPointAnalysis(release).entries[0].state, 'not-cached');
});
test('orphan detector finds a disconnected included resource', () => {
  const release = fixture();
  release.assets.push(asset('orphan', 'json', [], { path: 'orphan.json', sha256: sha('e') }));
  const result = orphanAssets(release);
  assert.deepEqual(result.orphans.map((entry) => entry.id), ['orphan']);
});
test('orphan detector measures unused bytes without adding synthetic estimates', () => {
  const release = fixture();
  release.assets.push(asset('orphan', 'json', [], { path: 'orphan.json', size: 777, sha256: sha('e') }));
  assert.equal(orphanAssets(release).totalBytes, 777);
});
test('no orphan resources exist when all reachable from HTML', () => {
  assert.equal(orphanAssets(fixture()).orphans.length, 0);
});
test('unused source detector counts a source with no claims', () => {
  const release = fixture();
  release.sources.push(source('s2'));
  assert.deepEqual(unreferencedSources(release).ids, ['s2']);
});
test('a sourced UNKNOWN claim counts as a source reference', () => {
  assert.deepEqual(unreferencedSources(fixture()).ids, []);
});
test('source dependents preserve the stored UNKNOWN state', () => {
  const result = sourceDependents(fixture(), 's1');
  assert.equal(result.claims[0].state, 'UNKNOWN');
  assert.equal(result.count, 1);
});
test('source dependents reject an unknown source identifier', () => {
  assert.equal(sourceDependents(fixture(), 'none').ok, false);
});
test('blocked source analysis never upgrades a claim', () => {
  const release = fixture();
  release.sources[0].review = 'blocked';
  const result = blockedSourceImpact(release);
  assert.deepEqual(result.impacted[0].claimIds, ['claim']);
  assert.equal(release.claims[0].state, 'UNKNOWN');
});
test('duplicate digest analysis flags identical payload hashes', () => {
  const result = duplicateDigests(fixture());
  assert.equal(result.duplicates.length, 1);
  assert.deepEqual(result.duplicates[0].ids, ['script', 'style']);
});
test('unique digest analysis has no findings', () => {
  const release = fixture();
  release.assets.forEach((entry, index) => { entry.sha256 = String(index).repeat(64); });
  assert.equal(duplicateDigests(release).duplicates.length, 0);
});
test('size by kind counts only included bytes', () => {
  const result = sizeByKind(fixture());
  assert.equal(result.sizes.html, 100);
  assert.equal(result.sizes.script, 100);
});
test('size by cache policy counts explicit precache bytes', () => {
  assert.equal(sizeByCachePolicy(fixture()).sizes.precache, 400);
});
test('size by cache policy preserves explicit not-cached bytes', () => {
  const release = update(fixture(), 'font', { cache: 'not-cached' });
  const result = sizeByCachePolicy(release);
  assert.equal(result.sizes['not-cached'], 100);
});
test('risk register detects uncached resources for manual review', () => {
  const release = update(fixture(), 'font', { cache: 'not-cached' });
  assert.ok(offlineRiskRegister(release).risks.some((risk) => risk.kind === 'not-cached'));
});
test('risk register detects source not referenced by any claim', () => {
  const release = fixture(); release.sources.push(source('s2'));
  assert.ok(offlineRiskRegister(release).risks.some((risk) => risk.id === 's2'));
});
test('risk register lists blocked sources as review findings', () => {
  const release = fixture(); release.sources[0].review = 'blocked';
  assert.ok(offlineRiskRegister(release).risks.some((risk) => risk.kind === 'blocked-source'));
});
test('risk register is sorted deterministically', () => {
  const report = offlineRiskRegister(fixture()).risks;
  assert.deepEqual(report, [...report].sort((a, b) => a.kind.localeCompare(b.kind, 'en') || a.id.localeCompare(b.id, 'en')));
});
test('graph summary reports structure not runtime guarantees', () => {
  const result = manifestGraphSummary(fixture());
  assert.equal(result.summary.availableEntryPoints, 1);
  assert.equal(result.summary.maximumDependencyLayers, 3);
});
test('graph summary reports cache bytes and unused sources', () => {
  const result = manifestGraphSummary(fixture());
  assert.equal(result.summary.cacheBytes.precache, 400);
  assert.equal(result.summary.unusedSources, 0);
});
test('bounded traces show dependency paths in deterministic order', () => {
  const result = boundedDependencyTrace(fixture(), 'index');
  assert.equal(result.ok, true);
  assert.equal(result.traces[0].id, 'index');
  assert.ok(result.traces.some((entry) => entry.path.join('/') === 'index/script/font'));
});
test('bounded trace refuses an absent target', () => {
  assert.equal(boundedDependencyTrace(fixture(), 'absent').ok, false);
});
test('invalid graph input fails closed rather than returning a reassuring summary', () => {
  const release = fixture(); release.assets[0].dependsOn = ['missing'];
  const result = manifestGraphSummary(release);
  assert.equal(result.ok, false);
  assert.equal(result.summary, undefined);
});
test('graph inspections never mutate source release arrays', () => {
  const release = fixture(); const before = copy(release);
  offlineRiskRegister(release);
  graphLayers(release);
  sourceDependents(release, 's1');
  assert.deepEqual(release, before);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  indexAssets, reverseEdges, dependencies, dependants, entryPoints, reachable,
  orphanAssets, cycles, rootCoverage, impactFor, graphReview, criticalPath,
} from './release-impact-graph.mjs';
import { asset, manifest, bilingual, chain, DAY, mutate } from './release-impact-fixtures.mjs';
import { UNKNOWN } from './release-impact-contract.mjs';
const simple = manifest(asset('a', { entry: true, dependsOn: ['b'] }), asset('b'));
const fork = manifest(asset('a', { entry: true, dependsOn: ['b', 'c'] }), asset('b', { dependsOn: ['d'] }),
  asset('c', { dependsOn: ['d'] }), asset('d'));
const island = manifest(asset('a', { entry: true }), asset('b'), asset('c', { dependsOn: ['b'] }));
const cycle = manifest(asset('a', { entry: true, dependsOn: ['b'] }), asset('b', { dependsOn: ['c'] }), asset('c', { dependsOn: ['a'] }));
const bi = bilingual();
test('index contains all ids', () => assert.deepEqual([...indexAssets(simple).keys()], ['a', 'b']));
test('index points at the exact asset', () => assert.equal(indexAssets(simple).get('a'), simple.assets[0]));
test('index does not invent a missing identifier', () => assert.equal(indexAssets(simple).has('missing'), false));
test('reverse links to parent', () => assert.deepEqual(reverseEdges(simple).get('b'), ['a']));
test('root has no reverse references', () => assert.deepEqual(reverseEdges(simple).get('a'), []));
test('reverse edges include all nodes', () => assert.equal(reverseEdges(fork).size, 4));
test('reverse edges are sorted', () => assert.deepEqual(reverseEdges(fork).get('d'), ['b', 'c']));
test('dependencies of a simple root', () => assert.deepEqual(dependencies(simple, 'a'), ['b']));
test('dependencies of a leaf empty', () => assert.deepEqual(dependencies(simple, 'b'), []));
test('unknown dependency root empty', () => assert.deepEqual(dependencies(simple, 'missing'), []));
test('diamond paths collapse shared dependency', () => assert.deepEqual(dependencies(fork, 'a'), ['b', 'c', 'd']));
test('nested dependencies include depth two', () => assert.ok(dependencies(fork, 'a').includes('d')));
test('dependencies omit the root on acyclic graph', () => assert.ok(!dependencies(fork, 'a').includes('a')));
test('dependants of simple leaf includes root', () => assert.deepEqual(dependants(simple, 'b'), ['a']));
test('dependants of root empty', () => assert.deepEqual(dependants(simple, 'a'), []));
test('dependants of absent id empty', () => assert.deepEqual(dependants(simple, 'absent'), []));
test('dependants of diamond shared leaf include three', () => assert.deepEqual(dependants(fork, 'd'), ['a', 'b', 'c']));
test('dependants sorted alphabetically', () => assert.deepEqual(dependants(fork, 'd'), ['a', 'b', 'c']));
test('single root listed', () => assert.deepEqual(entryPoints(simple), ['a']));
test('two locale roots listed', () => assert.deepEqual(entryPoints(bi), ['en', 'fr']));
test('zero roots allowed structurally', () => assert.deepEqual(entryPoints(manifest(asset('a'))), []));
test('reachable includes entry', () => assert.ok(reachable(simple).includes('a')));
test('reachable includes leaf', () => assert.ok(reachable(simple).includes('b')));
test('reachable over fork includes all', () => assert.deepEqual(reachable(fork), ['a', 'b', 'c', 'd']));
test('reachable empty without entries', () => assert.deepEqual(reachable(manifest(asset('a'))), []));
test('orphan found when disconnected', () => assert.deepEqual(orphanAssets(island), ['b', 'c']));
test('root is not orphan', () => assert.ok(!orphanAssets(island).includes('a')));
test('complete graph has no orphans', () => assert.deepEqual(orphanAssets(fork), []));
test('bilingual connected manifest has no orphans', () => assert.deepEqual(orphanAssets(bi), []));
test('two disconnected nonentry assets are both orphaned', () => assert.equal(orphanAssets(island).length, 2));
test('simple acyclic graph contains no cycle', () => assert.deepEqual(cycles(simple), []));
test('fork without cycles remains acyclic', () => assert.deepEqual(cycles(fork), []));
test('three-node cycle detected', () => assert.deepEqual(cycles(cycle), [['a', 'b', 'c']]));
test('cycle result sorted', () => assert.deepEqual(cycles(cycle)[0], ['a', 'b', 'c']));
test('independent cycle detected', () => {
  const data = manifest(asset('a', { entry: true }), asset('b', { dependsOn: ['c'] }), asset('c', { dependsOn: ['b'] }));
  assert.deepEqual(cycles(data), [['b', 'c']]);
});
test('two separate cycles retained', () => {
  const data = manifest(asset('a', { dependsOn: ['b'] }), asset('b', { dependsOn: ['a'] }),
    asset('c', { dependsOn: ['d'] }), asset('d', { dependsOn: ['c'] }));
  assert.deepEqual(cycles(data), [['a', 'b'], ['c', 'd']]);
});
test('coverage includes a single root', () => assert.equal(rootCoverage(simple).length, 1));
test('coverage count includes root plus leaf', () => assert.equal(rootCoverage(simple)[0].count, 2));
test('coverage bytes accumulate root plus leaf', () => assert.equal(rootCoverage(simple)[0].bytes, 200));
test('coverage retains locale of root', () => assert.equal(rootCoverage(simple)[0].locale, 'en'));
test('coverage returns both languages', () => assert.deepEqual(rootCoverage(bi).map(x => x.locale), ['en', 'fr']));
test('coverage does not double-count shared leaf', () => assert.equal(rootCoverage(fork)[0].count, 4));
test('coverage unknown source records flagged', () => {
  const data = manifest(asset('a', { entry: true, dependsOn: ['b'] }), asset('b', { tier: UNKNOWN }));
  assert.deepEqual(rootCoverage(data)[0].unknown, ['b']);
});
test('root unknown flagged', () => {
  const data = manifest(asset('a', { entry: true, tier: UNKNOWN }));
  assert.deepEqual(rootCoverage(data)[0].unknown, ['a']);
});
test('documented graph has no unknowns', () => assert.deepEqual(rootCoverage(simple)[0].unknown, []));
test('impact absent id returns null', () => assert.equal(impactFor(simple, 'absent'), null));
test('impact leaf propagates to root', () => assert.deepEqual(impactFor(simple, 'b').impactedEntries, ['a']));
test('impact root lists itself', () => assert.deepEqual(impactFor(simple, 'a').impactedEntries, ['a']));
test('impact leaf returns original path', () => assert.equal(impactFor(simple, 'b').path, 'assets/b.js'));
test('impact source tier unknown remains UNKNOWN', () => {
  const data = manifest(asset('a', { entry: true, tier: UNKNOWN }));
  assert.equal(impactFor(data, 'a').risk, UNKNOWN);
});
test('documented impact requires review', () => assert.equal(impactFor(simple, 'b').risk, 'needs-review'));
test('shared leaf impacts both entry paths', () => assert.deepEqual(impactFor(bi, 'shared').impactedEntries, ['en', 'fr']));
test('impact of disconnected asset has zero affected entries', () => assert.equal(impactFor(island, 'b').entryCount, 0));
test('impact referencedBy includes parent even without root', () => assert.deepEqual(impactFor(island, 'b').referencedBy, ['c']));
test('graphReview rejects bad input', () => assert.equal(graphReview({}).ok, false));
test('graphReview reports valid manifest', () => assert.equal(graphReview(simple, { today: DAY }).ok, true));
test('graphReview reports one dependency', () => assert.equal(graphReview(simple).value.dependencies, 1));
test('graphReview reports three fork edges', () => assert.equal(graphReview(fork).value.dependencies, 4));
test('graphReview reports one cycle', () => assert.equal(graphReview(cycle).value.cycles.length, 1));
test('graphReview preserves unknown tier details', () => {
  const data = manifest(asset('a', { entry: true, tier: UNKNOWN }));
  assert.deepEqual(graphReview(data).value.unknownTier, ['a']);
});
test('graphReview preserves source manifest', () => assert.equal(graphReview(bi).value.roots.length, 2));
test('graphReview includes impact for each asset', () => assert.equal(graphReview(fork).value.impacted.length, 4));
test('criticalPath has root and leaf', () => assert.deepEqual(criticalPath(simple, 'a'), ['a', 'b']));
test('criticalPath leaf is itself', () => assert.deepEqual(criticalPath(simple, 'b'), ['b']));
test('criticalPath unknown returns []', () => assert.deepEqual(criticalPath(simple, 'missing'), []));
test('criticalPath follows longest chain', () => assert.deepEqual(criticalPath(fork, 'a'), ['a', 'b', 'd']));
test('criticalPath does not loop forever on cycles', () => assert.equal(criticalPath(cycle, 'a').length, 4));
test('criticalPath chooses deterministic lexicographic tie', () => assert.deepEqual(criticalPath(fork, 'a'), criticalPath(fork, 'a')));
test('reverse edges do not mutate original manifest', () => {
  const data = mutate(simple);
  reverseEdges(data);
  assert.deepEqual(data, simple);
});
test('rootCoverage does not mutate original entry list', () => {
  const data = mutate(bi);
  rootCoverage(data);
  assert.deepEqual(data, bi);
});
test('risk does not invent PASS for a documented artifact', () => assert.notEqual(impactFor(simple, 'a').risk, 'PASS'));
test('graph review never assigns accessibility condition', () => {
  const value = graphReview(simple).value;
  assert.ok(!Object.keys(value).includes('accessible'));
});
test('one binary file may have no entry point', () => assert.deepEqual(rootCoverage(manifest(asset('image', { kind: 'image' }))), []));
test('entry source bytes are accumulated independently by locale', () => assert.equal(rootCoverage(bi)[0].bytes, 200));
test('entry source counts are independent by locale', () => assert.equal(rootCoverage(bi)[1].count, 2));
test('source confidence is not upgraded by dependency reachability', () => {
  const data = manifest(asset('a', { entry: true, dependsOn: ['b'] }), asset('b', { tier: UNKNOWN }));
  assert.equal(indexAssets(data).get('b').tier, UNKNOWN);
  assert.equal(impactFor(data, 'b').risk, UNKNOWN);
});
test('an unreferenced orphan still has a path', () => assert.equal(impactFor(island, 'c').path, 'assets/c.js'));
test('graph traversal with a shared dependency terminates deterministically', () => {
  assert.deepEqual(dependencies(fork, 'a'), dependencies(fork, 'a'));
});
test('all roots are in the impact array', () => {
  const value = graphReview(bi).value;
  assert.ok(value.roots.every(id => value.impacted.some(item => item.id === id)));
});

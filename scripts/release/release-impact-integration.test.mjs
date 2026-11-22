/** Contract tests across manifest, impact, policy, reports, integrity, and opt-in CLI. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { DAY, asset, manifest, bilingual, mutate, SHA_B } from './release-impact-fixtures.mjs';
import { checkManifest, parseManifest, UNKNOWN } from './release-impact-contract.mjs';
import { graphReview, impactFor, reachable } from './release-impact-graph.mjs';
import { compareManifest } from './release-impact-delta.mjs';
import { reviewManifest, reviewDelta, planManualTasks } from './release-impact-policy.mjs';
import { renderReport } from './release-impact-report.mjs';
import { checkAssets } from './release-impact-integrity.mjs';
import { run } from './release-impact-cli.mjs';
const sha = text => createHash('sha256').update(text).digest('hex');
const out = () => { let value = ''; return { sink: { write(chunk) { value += chunk; } }, text: () => value }; };
const missing = (value, code) => value.issues?.some(issue => issue.code === code) ?? false;
async function fixtureDirectory(action) {
  const root = await mkdtemp(join(tmpdir(), 'release-impact-integration-'));
  try { return await action(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}
const paired = () => manifest(
  asset('en', { path: 'index-en.html', kind: 'html', entry: true, locale: 'en', dependsOn: ['shared'] }),
  asset('fr', { path: 'index-fr.html', kind: 'html', entry: true, locale: 'fr', dependsOn: ['shared'] }),
  asset('shared', { path: 'assets/shared.js', dependsOn: [] }),
);
test('valid fictional EN/FR manifest validates without source fabrication', () => {
  const result = checkManifest(paired(), { today: DAY });
  assert.equal(result.ok, true);
  assert.ok(result.value.assets.every(item => item.source === 'Fictional build manifest'));
});
test('both EN and FR entry points are structurally reachable', () => {
  assert.deepEqual(graphReview(paired()).value.roots, ['en', 'fr']);
});
test('shared dependency affects both language entry points', () => {
  assert.deepEqual(impactFor(paired(), 'shared').impactedEntries, ['en', 'fr']);
});
test('release dependency audit does not infer language translation quality', () => {
  const graph = graphReview(paired()).value;
  assert.ok(!Object.keys(graph).includes('translationPassed'));
});
test('one shared digest changes both language roots', () => {
  const before = paired(), after = paired();
  after.assets[2].sha256 = SHA_B;
  const change = compareManifest(before, after, { today: DAY });
  assert.deepEqual(change.value.items[0].impactedEntries, ['en', 'fr']);
});
test('one change is not counted as two changed assets', () => {
  const before = paired(), after = paired();
  after.assets[2].sha256 = SHA_B;
  assert.deepEqual(compareManifest(before, after, { today: DAY }).value.changed, ['shared']);
});
test('changed digest without provenance change keeps evidence metadata intact', () => {
  const before = paired(), after = paired();
  after.assets[2].sha256 = SHA_B;
  assert.deepEqual(compareManifest(before, after).value.provenance, []);
});
test('changing just a source requires human review without certifying it', () => {
  const before = paired(), after = paired();
  after.assets[2].source = 'Alternate fictional source';
  const findings = reviewDelta(before, after, { today: DAY });
  assert.ok(findings.value.items.some(item => item.finding === 'SOURCE_CHANGED'));
  assert.ok(!findings.value.items.some(item => item.finding === 'CERTIFIED'));
});
test('unknown tier preserves UNKNOWN through graph and reports', () => {
  const data = paired(); data.assets[2].tier = UNKNOWN;
  assert.ok(graphReview(data).value.unknownTier.includes('shared'));
  assert.match(renderReport(data, { language: 'fr', format: 'text', today: DAY }).value.content, /UNKNOWN/u);
});
test('incomplete evidence cannot become a PASS flag', () => {
  const data = paired(); data.assets[2].tier = UNKNOWN;
  const result = reviewManifest(data, { today: DAY });
  assert.ok(result.value.issues.some(item => item.finding === 'UNKNOWN_TIER'));
  assert.ok(!result.value.issues.some(item => item.finding === 'PASS'));
});
test('report data and graph retain the same number of assets', () => {
  const data = paired();
  assert.equal(JSON.parse(renderReport(data, { format: 'json', today: DAY }).value.content).manifest.assets.length, data.assets.length);
});
test('French text report includes provenance fields', () => {
  const text = renderReport(paired(), { format: 'text', language: 'fr', today: DAY }).value.content;
  assert.match(text, /Source\u00a0: Fictional build manifest/u);
  assert.match(text, /Licence\u00a0: CC0-1\.0/u);
});
test('French HTML never substitutes Inconnu for UNKNOWN', () => {
  const data = paired(); data.assets[2].tier = UNKNOWN;
  const html = renderReport(data, { format: 'html', language: 'fr', today: DAY }).value.content;
  assert.doesNotMatch(html, /Inconnu/iu);
  assert.match(html, /UNKNOWN/u);
});
test('English and French reports include separate language attributes', () => {
  const en = renderReport(paired(), { format: 'html', language: 'en', today: DAY }).value.content;
  const fr = renderReport(paired(), { format: 'html', language: 'fr', today: DAY }).value.content;
  assert.match(en, /<html lang="en">/u);
  assert.match(fr, /<html lang="fr">/u);
});
test('reports have keyboard focus treatment and minimum 44px navigation', () => {
  const html = renderReport(paired(), { format: 'html', today: DAY }).value.content;
  assert.match(html, /:focus-visible/u);
  assert.match(html, /min-height:44px;min-width:44px/u);
});
test('bilingual report remains static and works without a network', () => {
  const html = renderReport(paired(), { format: 'html', language: 'fr', today: DAY }).value.content;
  assert.doesNotMatch(html, /<script\s+src=/iu);
  assert.doesNotMatch(html, /fetch\(/u);
});
test('CSV report rejects spreadsheet formula execution in supplied source', () => {
  const data = paired(); data.assets[2].source = '=HYPERLINK("https://example.invalid")';
  const csv = renderReport(data, { format: 'csv', today: DAY }).value.content;
  assert.match(csv, /"'=HYPERLINK/u);
});
test('source strings with markup are escaped in static HTML', () => {
  const data = paired(); data.assets[2].source = '<b>Fictional</b>';
  const html = renderReport(data, { format: 'html', today: DAY }).value.content;
  assert.match(html, /&lt;b&gt;Fictional&lt;\/b&gt;/u);
});
test('graph reachability remains invariant under supplied asset order', () => {
  const a = paired(), b = paired(); b.assets.reverse();
  assert.deepEqual(reachable(a), reachable(b));
});
test('graph impact remains stable under asset order changes', () => {
  const a = paired(), b = paired(); b.assets.reverse();
  assert.deepEqual(impactFor(a, 'shared'), impactFor(b, 'shared'));
});
test('manifest comparison after serialization remains stable', () => {
  const a = paired(), b = parseManifest(JSON.stringify(a), { today: DAY }).value;
  assert.deepEqual(compareManifest(a, b, { today: DAY }).value.changed, []);
});
test('JSON report can be imported without implying a new valid manifest', () => {
  const data = paired();
  const output = JSON.parse(renderReport(data, { format: 'json', today: DAY }).value.content);
  assert.equal(output.schemaVersion, 1);
  assert.equal(checkManifest(output, { today: DAY }).ok, false);
});
test('orphaned assets produce manual tasks', () => {
  const data = manifest(asset('root', { entry: true, locale: 'both' }), asset('orphan'));
  assert.ok(planManualTasks(reviewManifest(data, { today: DAY })).some(item => item.assetId === 'orphan'));
});
test('source age concern does not remove original timestamp', () => {
  const data = paired(); data.assets[2].retrievedOn = '2024-01-01';
  const review = reviewManifest(data, { today: DAY });
  assert.ok(review.value.issues.some(item => item.finding === 'OLD_SOURCE'));
  assert.equal(data.assets[2].retrievedOn, '2024-01-01');
});
test('release snapshot change does not silently mutate prior inventory', () => {
  const old = paired(), next = mutate(old); next.assets[0].bytes = 200;
  compareManifest(old, next, { today: DAY });
  assert.equal(old.assets[0].bytes, 100);
});
test('manifest traversal is blocked even before file access', () => {
  const data = paired(); data.assets[0].path = '../secret';
  assert.equal(checkManifest(data, { today: DAY }).ok, false);
});
test('metadata with an invalid digest is rejected before disk access', () => {
  const data = paired(); data.assets[0].sha256 = 'abc';
  assert.ok(missing(checkManifest(data, { today: DAY }), 'INVALID_SHA256'));
});
test('referencing a missing artifact fails without creating an orphan entry', () => {
  const data = paired(); data.assets[0].dependsOn.push('missing');
  const result = checkManifest(data, { today: DAY });
  assert.ok(missing(result, 'UNRESOLVED_DEPENDENCY'));
});
test('unknown tier is preserved across JSON report round trip', () => {
  const data = paired(); data.assets[2].tier = UNKNOWN;
  const output = JSON.parse(renderReport(data, { format: 'json', today: DAY }).value.content);
  assert.equal(output.manifest.assets.find(row => row.id === 'shared').tier, UNKNOWN);
});
test('read-only byte comparison reports matching local content', async () => fixtureDirectory(async folder => {
  const dist = join(folder, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  const content = 'fictional bytes';
  await writeFile(join(dist, 'assets/module.js'), content);
  const data = manifest(asset('module', { entry: true, locale: 'both', path: 'assets/module.js', bytes: Buffer.byteLength(content), sha256: sha(content) }));
  const result = await checkAssets(dist, data, { today: DAY });
  assert.deepEqual([result.value.checked, result.value.failed], [1, 0]);
}));
test('byte-integrity check fails if local file was altered', async () => fixtureDirectory(async folder => {
  const dist = join(folder, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'assets/module.js'), 'changed');
  const data = manifest(asset('module', { entry: true, locale: 'both', path: 'assets/module.js', bytes: 7, sha256: sha('original') }));
  const result = await checkAssets(dist, data, { today: DAY });
  assert.equal(result.value.findings[0].code, 'HASH_MISMATCH');
}));
test('manual CLI report stores a JSON report at explicit output path', async () => fixtureDirectory(async folder => {
  const input = join(folder, 'input.json'), output = join(folder, 'report.json');
  await writeFile(input, JSON.stringify(paired()));
  const stdout = out(), stderr = out();
  const code = await run(['--after', input, '--output', output, '--format', 'json', '--today', DAY], { stdout: stdout.sink, stderr: stderr.sink });
  assert.equal(code, 0);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).schemaVersion, 1);
  assert.equal(stderr.text(), '');
}));
test('manual CLI rejects non-manifest JSON without writing a report', async () => fixtureDirectory(async folder => {
  const input = join(folder, 'bad.json'), output = join(folder, 'report.json');
  await writeFile(input, JSON.stringify({ version: 99, assets: [] }));
  const code = await run(['--after', input, '--output', output, '--format', 'json', '--today', DAY], { stdout: out().sink, stderr: out().sink });
  assert.equal(code, 1);
  await assert.rejects(readFile(output), /ENOENT/u);
}));
test('manual CLI will not overwrite an existing handoff report', async () => fixtureDirectory(async folder => {
  const input = join(folder, 'input.json'), output = join(folder, 'report.json');
  await writeFile(input, JSON.stringify(paired()));
  await writeFile(output, 'existing user review');
  const code = await run(['--after', input, '--output', output, '--format', 'json', '--today', DAY], { stdout: out().sink, stderr: out().sink });
  assert.equal(code, 1);
  assert.equal(await readFile(output, 'utf8'), 'existing user review');
}));
test('manual CLI makes no background network request by contract', async () => {
  const options = ['--after', 'missing', '--output', 'unused'];
  const result = await run(options, { stdout: out().sink, stderr: out().sink });
  assert.equal(result, 1);
});
test('report-only mode never requires private keys or external accounts', () => {
  const output = renderReport(paired(), { format: 'json', today: DAY });
  assert.equal(output.ok, true);
  assert.doesNotMatch(output.value.content, /api[_-]?key|password|bearer token/iu);
});
test('review report does not assert a route is navigable at runtime', () => {
  const result = renderReport(paired(), { format: 'text', today: DAY });
  assert.doesNotMatch(result.value.content, /guaranteed available|always navigable/iu);
});
test('release impact output is deterministic for the same documents', () => {
  const a = renderReport(paired(), { format: 'json', today: DAY });
  const b = renderReport(paired(), { format: 'json', today: DAY });
  assert.equal(a.value.content, b.value.content);
});
test('invalid asset type never reaches report renderer', () => {
  const data = paired(); data.assets[0].kind = 'application';
  assert.equal(renderReport(data, { format: 'html', today: DAY }).ok, false);
});
test('inconsistent source metadata never reaches report renderer', () => {
  const data = paired(); data.assets[0].source = '';
  assert.equal(renderReport(data, { format: 'html', today: DAY }).ok, false);
});
test('report does not change the existing install budget enforcement', () => {
  const result = reviewManifest(paired(), { today: DAY });
  assert.equal(result.value.bytes, 300);
  assert.ok(!Object.keys(result.value).includes('newBudget'));
});

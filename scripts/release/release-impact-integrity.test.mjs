import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { insideRoot, inspectFile, checkAssets, MAX_BYTES_PER_ASSET } from './release-impact-integrity.mjs';
import { asset, manifest, DAY } from './release-impact-fixtures.mjs';
const hash = content => createHash('sha256').update(content).digest('hex');
const file = (content = 'fictional JavaScript module') => asset('app', {
  path: 'assets/app.js', sha256: hash(content), bytes: Buffer.byteLength(content), entry: true,
});
const issueCodes = outcome => outcome.value?.findings.map(row => row.code) ?? outcome.issues.map(row => row.code);
async function withTree(run) {
  const root = await mkdtemp(join(tmpdir(), 'release-impact-'));
  try {
    await mkdir(join(root, 'assets'), { recursive: true });
    return await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('asset per-file cap is exactly 50 MiB', () => assert.equal(MAX_BYTES_PER_ASSET, 50 * 1024 * 1024));
test('insideRoot accepts nested asset', () => assert.equal(insideRoot('/tmp/root', 'assets/app.js'), true));
test('insideRoot rejects parent path', () => assert.equal(insideRoot('/tmp/root', '../outside.txt'), false));
test('insideRoot rejects same root', () => assert.equal(insideRoot('/tmp/root', '.'), false));
test('insideRoot rejects sibling directory', () => assert.equal(insideRoot('/tmp/root', '../root2/file'), false));
test('insideRoot accepts deep descendant', () => assert.equal(insideRoot('/tmp/root', 'a/b/c/d.js'), true));
test('insideRoot handles trailing slash root', () => assert.equal(insideRoot('/tmp/root/', 'a.js'), true));
test('insideRoot blocks absolute unrelated path', () => assert.equal(insideRoot('/tmp/root', '/etc/passwd'), false));
test('inspectFile detects missing resource', async () => withTree(async root => {
  const result = await inspectFile(root, file());
  assert.equal(result.ok, false);
  assert.equal(result.issue.code, 'FILE_MISSING');
}));
test('inspectFile matches correct local SHA-256', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  const result = await inspectFile(root, file());
  assert.equal(result.ok, true);
  assert.equal(result.sha256, file().sha256);
}));
test('inspectFile matches exact bytes', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  const result = await inspectFile(root, file());
  assert.equal(result.bytes, file().bytes);
}));
test('inspectFile rejects altered digest with same size', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  const changed = file(); changed.sha256 = 'f'.repeat(64);
  const result = await inspectFile(root, changed);
  assert.equal(result.issue.code, 'HASH_MISMATCH');
}));
test('inspectFile rejects larger local size', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'a longer fictional JavaScript module');
  const result = await inspectFile(root, file());
  assert.equal(result.issue.code, 'SIZE_MISMATCH');
}));
test('inspectFile rejects smaller local size', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'x');
  const result = await inspectFile(root, file());
  assert.equal(result.issue.code, 'SIZE_MISMATCH');
}));
test('inspectFile rejects file symlink', async () => withTree(async root => {
  await writeFile(join(root, 'real.js'), 'fictional JavaScript module');
  await symlink(join(root, 'real.js'), join(root, 'assets/app.js'));
  const result = await inspectFile(root, file());
  assert.equal(result.ok, false);
  assert.equal(result.issue.code, 'UNSAFE_FILE');
}));
test('inspectFile rejects symlink directory', async () => withTree(async root => {
  await writeFile(join(root, 'real.js'), 'fictional JavaScript module');
  await mkdir(join(root, 'linked'));
  await symlink(join(root, 'linked'), join(root, 'alias'));
  const item = file(); item.path = 'alias/app.js';
  const result = await inspectFile(root, item);
  assert.equal(result.issue.code, 'UNSAFE_DIRECTORY');
}));
test('inspectFile refuses traversal despite malformed direct input', async () => withTree(async root => {
  const item = file(); item.path = '../escape.js';
  const result = await inspectFile(root, item);
  assert.equal(result.issue.code, 'PATH_OUTSIDE_ROOT');
}));
test('inspectFile returns error for unreadable path type', async () => withTree(async root => {
  await mkdir(join(root, 'assets/app.js'));
  const result = await inspectFile(root, file());
  assert.equal(result.issue.code, 'UNSAFE_FILE');
}));
test('checkAssets checks complete fictional manifest', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  const report = await checkAssets(root, manifest(file()), { today: DAY });
  assert.equal(report.ok, true);
  assert.deepEqual([report.value.checked, report.value.passed, report.value.failed], [1, 1, 0]);
}));
test('checkAssets includes a SHA receipt for every passing file', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  const report = await checkAssets(root, manifest(file()), { today: DAY });
  assert.deepEqual(report.value.receipts, [{ id: 'app', bytes: file().bytes, sha256: file().sha256 }]);
}));
test('checkAssets does not label matching bytes as accessible', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  const report = await checkAssets(root, manifest(file()), { today: DAY });
  assert.match(report.value.caution, /not accessibility/u);
}));
test('checkAssets returns missing file finding', async () => withTree(async root => {
  const report = await checkAssets(root, manifest(file()), { today: DAY });
  assert.deepEqual(issueCodes(report), ['FILE_MISSING']);
}));
test('checkAssets returns digest mismatch finding', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  const item = file(); item.sha256 = '0'.repeat(64);
  const report = await checkAssets(root, manifest(item), { today: DAY });
  assert.deepEqual(issueCodes(report), ['HASH_MISMATCH']);
}));
test('checkAssets returns size mismatch finding', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  const item = file(); item.bytes += 1;
  const report = await checkAssets(root, manifest(item), { today: DAY });
  assert.deepEqual(issueCodes(report), ['SIZE_MISMATCH']);
}));
test('checkAssets refuses missing root', async () => withTree(async root => {
  const report = await checkAssets(join(root, 'not-here'), manifest(file()), { today: DAY });
  assert.deepEqual(issueCodes(report), ['ROOT_MISSING']);
}));
test('checkAssets rejects empty root argument', async () => {
  const result = await checkAssets('', manifest(file()));
  assert.deepEqual(issueCodes(result), ['ROOT_INVALID']);
});
test('checkAssets rejects malformed manifest', async () => withTree(async root => {
  const report = await checkAssets(root, { version: 2 }, { today: DAY });
  assert.equal(report.ok, false);
}));
test('checkAssets rejects root symbolic link', async () => withTree(async root => {
  const link = join(root, 'root-alias');
  await symlink(join(root, 'assets'), link);
  const report = await checkAssets(link, manifest(file()), { today: DAY });
  assert.deepEqual(issueCodes(report), ['ROOT_UNSAFE']);
}));
test('checkAssets refuses root that is regular file', async () => withTree(async root => {
  await writeFile(join(root, 'not-dir'), 'x');
  const report = await checkAssets(join(root, 'not-dir'), manifest(file()), { today: DAY });
  assert.deepEqual(issueCodes(report), ['ROOT_UNSAFE']);
}));
test('checkAssets checks separate resources deterministically', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  await writeFile(join(root, 'assets/new.js'), 'new');
  const secondary = asset('new', { path: 'assets/new.js', sha256: hash('new'), bytes: 3 });
  const report = await checkAssets(root, manifest(file(), secondary), { today: DAY });
  assert.equal(report.value.passed, 2);
  assert.deepEqual(report.value.receipts.map(row => row.id), ['app', 'new']);
}));
test('checkAssets reports one mismatch without hiding other passes', async () => withTree(async root => {
  await writeFile(join(root, 'assets/app.js'), 'fictional JavaScript module');
  const secondary = asset('missing', { path: 'assets/missing.js' });
  const report = await checkAssets(root, manifest(file(), secondary), { today: DAY });
  assert.deepEqual([report.value.passed, report.value.failed], [1, 1]);
}));
test('checkAssets does not create a missing file', async () => withTree(async root => {
  const report = await checkAssets(root, manifest(file()), { today: DAY });
  assert.equal(report.value.failed, 1);
  await assert.rejects(readFile(join(root, 'assets/app.js')), /ENOENT/u);
}));
test('inspectFile does not modify file contents', async () => withTree(async root => {
  const content = 'fictional JavaScript module';
  await writeFile(join(root, 'assets/app.js'), content);
  await inspectFile(root, file());
  assert.equal(await readFile(join(root, 'assets/app.js'), 'utf8'), content);
}));
test('checkAssets refuses future provenance date rather than assessing bytes', async () => withTree(async root => {
  const item = file(); item.retrievedOn = '2026-11-22';
  const report = await checkAssets(root, manifest(item), { today: DAY });
  assert.equal(report.ok, false);
  assert.ok(issueCodes(report).includes('FUTURE_RETRIEVAL_DATE'));
}));
test('checkAssets reports source identifiers and not private content', async () => withTree(async root => {
  const report = await checkAssets(root, manifest(file()), { today: DAY });
  assert.equal(report.value.findings[0].id, 'app');
  assert.equal(report.value.findings[0].path, 'assets/app.js');
}));

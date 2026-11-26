import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { parseArgs, readLocal, writeLocal, run } from './release-impact-cli.mjs';
import { asset, manifest, DAY } from './release-impact-fixtures.mjs';
const argv = (...parts) => ['--after', '/tmp/input.json', '--output', '/tmp/report.html', ...parts];
const writer = () => {
  let output = '';
  return { sink: { write(chunk) { output += chunk; } }, text() { return output; } };
};
async function temporary(runInFolder) {
  const folder = await mkdtemp(join(tmpdir(), 'release-impact-cli-'));
  try { return await runInFolder(folder); }
  finally { await rm(folder, { recursive: true, force: true }); }
}
async function prepare(folder, after = manifest(asset('app', { entry: true, locale: 'both' }))) {
  const input = join(folder, 'after.json');
  const output = join(folder, 'report.html');
  await writeFile(input, JSON.stringify(after));
  return { input, output };
}
test('CLI requires options', () => assert.equal(parseArgs([]).ok, false));
test('CLI rejects missing after', () => assert.equal(parseArgs(['--output', 'report.html']).error, 'REQUIRED_OPTIONS'));
test('CLI rejects missing output', () => assert.equal(parseArgs(['--after', 'input.json']).error, 'REQUIRED_OPTIONS'));
test('CLI accepts after and output', () => assert.equal(parseArgs(argv()).ok, true));
test('CLI accepts French language', () => assert.equal(parseArgs(argv('--language', 'fr')).ok, true));
test('CLI accepts English language', () => assert.equal(parseArgs(argv('--language', 'en')).ok, true));
test('CLI rejects Spanish language', () => assert.equal(parseArgs(argv('--language', 'es')).error, 'LANGUAGE_INVALID'));
test('CLI accepts HTML format', () => assert.equal(parseArgs(argv('--format', 'html')).ok, true));
test('CLI accepts text format', () => assert.equal(parseArgs(argv('--format', 'text')).ok, true));
test('CLI accepts JSON format', () => assert.equal(parseArgs(argv('--format', 'json')).ok, true));
test('CLI accepts CSV format', () => assert.equal(parseArgs(argv('--format', 'csv')).ok, true));
test('CLI rejects unknown output format', () => assert.equal(parseArgs(argv('--format', 'pdf')).error, 'FORMAT_INVALID'));
test('CLI accepts explicit today', () => assert.equal(parseArgs(argv('--today', DAY)).ok, true));
test('CLI rejects invalid date', () => assert.equal(parseArgs(argv('--today', 'yesterday')).error, 'DATE_INVALID'));
test('CLI rejects duplicate after flag', () => assert.equal(parseArgs(argv('--after', 'another.json')).error, 'ARGUMENTS'));
test('CLI rejects unknown flags', () => assert.equal(parseArgs(argv('--secret', 'value')).error, 'ARGUMENTS'));
test('CLI rejects missing value', () => assert.equal(parseArgs([...argv(), '--language']).error, 'ARGUMENTS'));
test('CLI accepts before manifest', () => assert.equal(parseArgs(argv('--before', 'before.json')).ok, true));
test('CLI accepts opt-in asset root', () => assert.equal(parseArgs(argv('--assets-root', '/tmp/assets')).ok, true));
test('CLI never offers a hidden server flag', () => assert.equal(parseArgs(argv('--server', 'https://example.invalid')).ok, false));
test('CLI never offers an automatic schedule flag', () => assert.equal(parseArgs(argv('--cron', '* * * * *')).ok, false));
test('readLocal rejects empty path', async () => assert.rejects(readLocal(''), /UNSAFE_INPUT/u));
test('readLocal rejects null byte', async () => assert.rejects(readLocal('a\0b'), /UNSAFE_INPUT/u));
test('readLocal rejects nonexistent path', async () => assert.rejects(readLocal('/this/should/not/exist'), /ENOENT/u));
test('readLocal returns original text', async () => temporary(async folder => {
  const path = join(folder, 'local.json');
  await writeFile(path, '{"a":1}');
  assert.equal(await readLocal(path), '{"a":1}');
}));
test('readLocal rejects an empty file', async () => temporary(async folder => {
  const path = join(folder, 'empty.json');
  await writeFile(path, '');
  await assert.rejects(readLocal(path), /UNSAFE_INPUT/u);
}));
test('readLocal rejects directory', async () => temporary(async folder => {
  await assert.rejects(readLocal(folder), /UNSAFE_INPUT/u);
}));
test('readLocal rejects a symlink', async () => temporary(async folder => {
  await writeFile(join(folder, 'real.json'), '{}');
  await symlink(join(folder, 'real.json'), join(folder, 'link.json'));
  await assert.rejects(readLocal(join(folder, 'link.json')), /UNSAFE_INPUT/u);
}));
test('readLocal rejects oversized JSON', async () => temporary(async folder => {
  const path = join(folder, 'large.json');
  await writeFile(path, 'x'.repeat(2_097_153));
  await assert.rejects(readLocal(path), /UNSAFE_INPUT/u);
}));
test('writeLocal rejects empty path', async () => assert.rejects(writeLocal('', '{}'), /UNSAFE_OUTPUT/u));
test('writeLocal rejects null-byte path', async () => assert.rejects(writeLocal('a\0b', '{}'), /UNSAFE_OUTPUT/u));
test('writeLocal rejects non-text content', async () => temporary(async folder => {
  await assert.rejects(writeLocal(join(folder, 'file'), 42), /UNSAFE_OUTPUT/u);
}));
test('writeLocal creates new file', async () => temporary(async folder => {
  const path = join(folder, 'result.txt');
  assert.equal(await writeLocal(path, 'report'), path);
  assert.equal(await readFile(path, 'utf8'), 'report');
}));
test('writeLocal does not overwrite existing file', async () => temporary(async folder => {
  const path = join(folder, 'result.txt');
  await writeFile(path, 'original');
  await assert.rejects(writeLocal(path, 'changed'), /EEXIST/u);
  assert.equal(await readFile(path, 'utf8'), 'original');
}));
test('writeLocal rejects symlink at destination', async () => temporary(async folder => {
  await writeFile(join(folder, 'real.txt'), 'secret');
  await symlink(join(folder, 'real.txt'), join(folder, 'link.txt'));
  await assert.rejects(writeLocal(join(folder, 'link.txt'), 'changed'), /EEXIST/u);
  assert.equal(await readFile(join(folder, 'real.txt'), 'utf8'), 'secret');
}));
test('writeLocal rejects unsafe parent alias', async () => temporary(async folder => {
  await mkdir(join(folder, 'real'));
  await symlink(join(folder, 'real'), join(folder, 'alias'));
  await assert.rejects(writeLocal(join(folder, 'alias', 'report'), 'a'), /UNSAFE_OUTPUT/u);
}));
test('writeLocal sets owner-only permission', async () => temporary(async folder => {
  const path = join(folder, 'report.txt');
  await writeLocal(path, 'report');
  assert.equal((await stat(path)).mode & 0o777, 0o600);
}));
test('CLI run invalid argv returns non-zero', async () => {
  const out = writer(), err = writer();
  assert.equal(await run([], { stdout: out.sink, stderr: err.sink }), 1);
  assert.match(err.text(), /ARGUMENTS/u);
});
test('CLI run missing local file returns non-zero', async () => temporary(async folder => {
  const err = writer();
  assert.equal(await run(['--after', join(folder, 'missing.json'), '--output', join(folder, 'r.html')], { stdout: writer().sink, stderr: err.sink }), 1);
  assert.match(err.text(), /ENOENT/u);
}));
test('CLI run valid input creates HTML', async () => temporary(async folder => {
  const { input, output } = await prepare(folder);
  const out = writer(), err = writer();
  assert.equal(await run(['--after', input, '--output', output, '--today', DAY], { stdout: out.sink, stderr: err.sink }), 0);
  assert.match(await readFile(output, 'utf8'), /<html lang="en">/u);
  assert.match(out.text(), /RELEASE_IMPACT_REPORT_CREATED html/u);
  assert.equal(err.text(), '');
}));
test('CLI run French output retains UNKNOWN', async () => temporary(async folder => {
  const { input, output } = await prepare(folder);
  assert.equal(await run(['--after', input, '--output', output, '--language', 'fr', '--today', DAY], { stdout: writer().sink, stderr: writer().sink }), 0);
  assert.match(await readFile(output, 'utf8'), /UNKNOWN reste UNKNOWN/u);
}));
test('CLI run CSV output creates a BOM-prefixed file', async () => temporary(async folder => {
  const { input } = await prepare(folder);
  const output = join(folder, 'report.csv');
  assert.equal(await run(['--after', input, '--output', output, '--format', 'csv', '--today', DAY], { stdout: writer().sink, stderr: writer().sink }), 0);
  assert.ok((await readFile(output, 'utf8')).startsWith('\uFEFF'));
}));
test('CLI run JSON output produces parseable output', async () => temporary(async folder => {
  const { input } = await prepare(folder);
  const output = join(folder, 'report.json');
  assert.equal(await run(['--after', input, '--output', output, '--format', 'json', '--today', DAY], { stdout: writer().sink, stderr: writer().sink }), 0);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).schemaVersion, 1);
}));
test('CLI run text output includes source', async () => temporary(async folder => {
  const { input } = await prepare(folder);
  const output = join(folder, 'report.txt');
  assert.equal(await run(['--after', input, '--output', output, '--format', 'text', '--today', DAY], { stdout: writer().sink, stderr: writer().sink }), 0);
  assert.match(await readFile(output, 'utf8'), /Fictional build manifest/u);
}));
test('CLI refuses invalid manifest rather than saving', async () => temporary(async folder => {
  const { input, output } = await prepare(folder, { version: 9 });
  const err = writer();
  assert.equal(await run(['--after', input, '--output', output, '--today', DAY], { stdout: writer().sink, stderr: err.sink }), 1);
  assert.match(err.text(), /VERSION_UNSUPPORTED/u);
  await assert.rejects(readFile(output), /ENOENT/u);
}));
test('CLI refuses overwrite before creating any output', async () => temporary(async folder => {
  const { input, output } = await prepare(folder);
  await writeFile(output, 'existing');
  assert.equal(await run(['--after', input, '--output', output, '--today', DAY], { stdout: writer().sink, stderr: writer().sink }), 1);
  assert.equal(await readFile(output, 'utf8'), 'existing');
}));
test('CLI requires valid before manifest when supplied', async () => temporary(async folder => {
  const { input, output } = await prepare(folder);
  const older = join(folder, 'before.json');
  await writeFile(older, '{"bad":true}');
  assert.equal(await run(['--after', input, '--before', older, '--output', output, '--today', DAY], { stdout: writer().sink, stderr: writer().sink }), 1);
}));
test('CLI compares two snapshots when both supplied', async () => temporary(async folder => {
  const { input, output } = await prepare(folder);
  const older = join(folder, 'before.json');
  const data = manifest(asset('app', { entry: true, locale: 'both', sha256: 'b'.repeat(64) }));
  await writeFile(older, JSON.stringify(data));
  assert.equal(await run(['--after', input, '--before', older, '--output', output, '--today', DAY], { stdout: writer().sink, stderr: writer().sink }), 0);
  assert.match(await readFile(output, 'utf8'), /id="changes"/u);
}));
test('CLI optional asset-root can confirm exact bytes', async () => temporary(async folder => {
  const dist = join(folder, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  const content = 'example';
  await writeFile(join(dist, 'assets/app.js'), content);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const { input, output } = await prepare(folder, manifest(asset('app', { entry: true, locale: 'both', sha256, bytes: Buffer.byteLength(content) })));
  assert.equal(await run(['--after', input, '--output', output, '--assets-root', dist, '--today', DAY], { stdout: writer().sink, stderr: writer().sink }), 0);
}));
test('CLI optional asset-root fails on content mismatch', async () => temporary(async folder => {
  const dist = join(folder, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'assets/app.js'), 'different');
  const { input, output } = await prepare(folder);
  const err = writer();
  assert.equal(await run(['--after', input, '--output', output, '--assets-root', dist, '--today', DAY], { stdout: writer().sink, stderr: err.sink }), 1);
  assert.match(err.text(), /INTEGRITY_FAILURE/u);
  await assert.rejects(readFile(output), /ENOENT/u);
}));
test('CLI never starts a write when asset root is missing', async () => temporary(async folder => {
  const { input, output } = await prepare(folder);
  const err = writer();
  assert.equal(await run(['--after', input, '--output', output, '--assets-root', join(folder, 'missing'), '--today', DAY], { stdout: writer().sink, stderr: err.sink }), 1);
  await assert.rejects(readFile(output), /ENOENT/u);
}));

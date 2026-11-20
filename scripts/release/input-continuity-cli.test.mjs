import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, symlink, stat, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { args, safeInput, safeOutput, run, FLAGS } from './input-continuity-cli.mjs';
import { document, complete, clone } from './input-continuity-fixtures.mjs';

const cli = fileURLToPath(new URL('./input-continuity-cli.mjs', import.meta.url));
const create = async () => {
 const directory = await mkdtemp(join(tmpdir(), 'input-continuity-'));
 const input = join(directory, 'after.json');
 await writeFile(input, JSON.stringify(document(complete())), { mode: 0o600 });
 return { directory, input, before: join(directory, 'before.json'), output: join(directory, 'output.txt') };
};
async function withFixture(callback) {
 const fixture = await create();
 try { await callback(fixture); }
 finally { await rm(fixture.directory, { recursive: true, force: true }); }
}
function capture() {
 let out = '', err = '';
 return { stdout: { write: part => { out += part; } }, stderr: { write: part => { err += part; } }, output: () => out, errors: () => err };
}

test('CLI flags are bounded and include explicit input/output', () => {
 assert.ok(FLAGS.includes('--after'));
 assert.ok(FLAGS.includes('--output'));
 assert.ok(!FLAGS.includes('--url'));
 assert.ok(!FLAGS.includes('--fetch'));
});
test('empty arguments are rejected', () => {
 assert.equal(args([]).ok, false);
});
test('CLI requires a source file', () => {
 assert.equal(args(['--format', 'text']).ok, false);
});
test('odd number of arguments is rejected', () => {
 assert.equal(args(['--after']).ok, false);
});
test('unknown switch is rejected', () => {
 assert.equal(args(['--after', 'source.json', '--remote', 'server']).ok, false);
});
test('duplicate switch is rejected', () => {
 assert.equal(args(['--after', 'x', '--after', 'y']).ok, false);
});
test('empty option value is rejected', () => {
 assert.equal(args(['--after', '']).ok, false);
});
test('invalid format is rejected before reading files', () => {
 assert.equal(args(['--after', 'x', '--format', 'docx']).ok, false);
});
test('invalid language is rejected before reading files', () => {
 assert.equal(args(['--after', 'x', '--language', 'es']).ok, false);
});
test('valid minimal arguments use text reporting', () => {
 assert.equal(args(['--after', 'file.json']).ok, true);
});
test('valid complete arguments include comparison and output', () => {
 const result = args(['--after', 'after.json', '--before', 'before.json', '--format', 'csv', '--language', 'fr', '--output', 'output.csv']);
 assert.equal(result.ok, true);
 assert.equal(result.values['--format'], 'csv');
});
test('safeInput reads valid existing JSON', async () => {
 await withFixture(async ({ input }) => {
  const text = await safeInput(input);
  assert.equal(JSON.parse(text).sessions[0].id, 'complete');
 });
});
test('safeInput refuses directories', async () => {
 await withFixture(async ({ directory }) => {
  await assert.rejects(safeInput(directory), /UNSAFE_INPUT/u);
 });
});
test('safeInput refuses a symbolic link to a file', async () => {
 await withFixture(async ({ directory, input }) => {
  const link = join(directory, 'link.json');
  await symlink(input, link);
  await assert.rejects(safeInput(link), /UNSAFE_INPUT/u);
 });
});
test('safeInput refuses a missing file', async () => {
 await withFixture(async ({ directory }) => {
  await assert.rejects(safeInput(join(directory, 'not-present.json')));
 });
});
test('safeInput refuses non-string input', async () => {
 await assert.rejects(safeInput(null));
});
test('safeInput refuses NUL-containing paths', async () => {
 await assert.rejects(safeInput('bad\0path'), /UNSAFE_INPUT/u);
});
test('safeInput rejects files larger than its documented limit', async () => {
 await withFixture(async ({ directory }) => {
  const large = join(directory, 'large.json');
  await writeFile(large, 'x'.repeat(6_000_001));
  await assert.rejects(safeInput(large), /UNSAFE_INPUT/u);
 });
});
test('safeOutput creates only a new file', async () => {
 await withFixture(async ({ output }) => {
  await safeOutput(output, 'new report');
  assert.equal(await readFile(output, 'utf8'), 'new report');
 });
});
test('safeOutput uses owner-only permissions', async () => {
 await withFixture(async ({ output }) => {
  await safeOutput(output, 'private report');
  const info = await stat(output);
  assert.equal(info.mode & 0o077, 0);
 });
});
test('safeOutput rejects overwriting existing files', async () => {
 await withFixture(async ({ output }) => {
  await safeOutput(output, 'first');
  await assert.rejects(safeOutput(output, 'second'), e => e.code === 'EEXIST');
  assert.equal(await readFile(output, 'utf8'), 'first');
 });
});
test('safeOutput rejects a symlink destination', async () => {
 await withFixture(async ({ directory, input }) => {
  const link = join(directory, 'link.txt');
  await symlink(input, link);
  await assert.rejects(safeOutput(link, 'text'));
  assert.ok((await readFile(input, 'utf8')).includes('sessions'));
 });
});
test('safeOutput refuses a symlinked parent folder', async () => {
 await withFixture(async ({ directory }) => {
  const folder = join(directory, 'actual'); await mkdir(folder);
  const link = join(directory, 'linked'); await symlink(folder, link, 'dir');
  await assert.rejects(safeOutput(join(link, 'report.txt'), 'report'), /UNSAFE_OUTPUT/u);
 });
});
test('safeOutput refuses a missing parent folder', async () => {
 await withFixture(async ({ directory }) => {
  await assert.rejects(safeOutput(join(directory, 'missing', 'report.txt'), 'text'));
 });
});
test('safeOutput refuses writing to an existing directory', async () => {
 await withFixture(async ({ directory }) => {
  await assert.rejects(safeOutput(directory, 'text'));
 });
});
test('safeOutput refuses non-string content', async () => {
 await withFixture(async ({ output }) => {
  await assert.rejects(safeOutput(output, null), /UNSAFE_OUTPUT/u);
 });
});
test('safeOutput refuses a path containing NUL', async () => {
 await assert.rejects(safeOutput('bad\0path', 'text'), /UNSAFE_OUTPUT/u);
});
test('run without required arguments returns error code 2', async () => {
 const io = capture(); const result = await run([], io);
 assert.equal(result, 2);
 assert.ok(io.errors().includes('ARGUMENTS'));
});
test('run prints a valid English text report', async () => {
 await withFixture(async ({ input }) => {
  const io = capture(); const result = await run(['--after', input], io);
  assert.equal(result, 0);
  assert.ok(io.output().includes('Input continuity evidence review'));
 });
});
test('run prints a valid French report with correct punctuation', async () => {
 await withFixture(async ({ input }) => {
  const io = capture(); const result = await run(['--after', input, '--language', 'fr'], io);
  assert.equal(result, 0);
  assert.ok(io.output().includes('Séance\u00a0:'));
 });
});
test('run writes the selected report without printing it', async () => {
 await withFixture(async ({ input, output }) => {
  const io = capture(); const result = await run(['--after', input, '--output', output], io);
  assert.equal(result, 0);
  assert.equal(io.output(), '');
  assert.ok((await readFile(output, 'utf8')).includes('Recorded observations'));
 });
});
test('run produces an HTML report when explicitly requested', async () => {
 await withFixture(async ({ input }) => {
  const io = capture(); const result = await run(['--after', input, '--format', 'html'], io);
  assert.equal(result, 0);
  assert.ok(io.output().includes('<main>'));
 });
});
test('run produces parseable JSON', async () => {
 await withFixture(async ({ input }) => {
  const io = capture(); const result = await run(['--after', input, '--format', 'json'], io);
  assert.equal(result, 0);
  assert.equal(JSON.parse(io.output()).version, 1);
 });
});
test('run produces localized CSV headers', async () => {
 await withFixture(async ({ input }) => {
  const io = capture(); const result = await run(['--after', input, '--format', 'csv', '--language', 'fr'], io);
  assert.equal(result, 0);
  assert.ok(io.output().startsWith('"Séance"'));
 });
});
test('run rejects malformed source JSON without reporting content', async () => {
 await withFixture(async ({ input }) => {
  await writeFile(input, '{');
  const io = capture(); const result = await run(['--after', input], io);
  assert.equal(result, 2);
  assert.equal(io.output(), '');
  assert.ok(io.errors().includes('INVALID_AFTER'));
 });
});
test('run rejects a privacy-unsafe source', async () => {
 await withFixture(async ({ input }) => {
  const value = document(complete()); value.sessions[0].accessToken = 'do-not-report';
  await writeFile(input, JSON.stringify(value));
  const io = capture(); const result = await run(['--after', input], io);
  assert.equal(result, 2);
  assert.ok(!io.errors().includes('do-not-report'));
 });
});
test('run refuses a missing comparison file', async () => {
 await withFixture(async ({ input, before }) => {
  const io = capture(); const result = await run(['--after', input, '--before', before], io);
  assert.equal(result, 2);
  assert.ok(io.errors().includes('INPUT_OUTPUT_ERROR'));
 });
});
test('run produces a before/after comparison', async () => {
 await withFixture(async ({ input, before }) => {
  await writeFile(before, JSON.stringify(document()));
  const io = capture(); const result = await run(['--after', input, '--before', before], io);
  assert.equal(result, 0);
  assert.ok(io.output().includes('Changes:'));
 });
});
test('run respects an explicit historical reference day', async () => {
 await withFixture(async ({ input }) => {
  const io = capture(); const result = await run(['--after', input, '--today', '2026-11-19'], io);
  assert.equal(result, 2);
  assert.ok(io.errors().includes('RETRIEVAL_DATE'));
 });
});
test('run returns error if output file already exists', async () => {
 await withFixture(async ({ input, output }) => {
  await writeFile(output, 'existing');
  const io = capture(); const result = await run(['--after', input, '--output', output], io);
  assert.equal(result, 2);
  assert.equal(await readFile(output, 'utf8'), 'existing');
 });
});
test('run does not mutate input JSON', async () => {
 await withFixture(async ({ input }) => {
  const before = await readFile(input, 'utf8');
  await run(['--after', input], capture());
  assert.equal(await readFile(input, 'utf8'), before);
 });
});
test('direct Node entry point produces a report', async () => {
 await withFixture(async ({ input }) => {
  const result = spawnSync(process.execPath, [cli, '--after', input], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Input continuity evidence review'));
 });
});
test('direct Node CLI exits nonzero for an invalid path', () => {
 const result = spawnSync(process.execPath, [cli, '--after', '/not-a-real-file.json'], { encoding: 'utf8' });
 assert.notEqual(result.status, 0);
 assert.ok(result.stderr.includes('INPUT_OUTPUT_ERROR'));
});
test('direct Node CLI emits UTF-8 French text', async () => {
 await withFixture(async ({ input }) => {
  const result = spawnSync(process.execPath, [cli, '--after', input, '--language', 'fr'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('continuité'));
 });
});
test('resolved CLI path is absolute and local', () => {
 assert.equal(resolve(cli), cli);
 assert.ok(cli.endsWith('input-continuity-cli.mjs'));
});
test('synthetic fixture remains unchanged after reporting', async () => {
 await withFixture(async ({ input }) => {
  const original = clone(JSON.parse(await readFile(input, 'utf8')));
  await run(['--after', input], capture());
  assert.deepEqual(JSON.parse(await readFile(input, 'utf8')), original);
 });
});

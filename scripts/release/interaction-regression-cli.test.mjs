import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import {
  CLI_OPTIONS, parseCliArguments, cliHelp, readSafeInput,
  writeNewFile, runRegressionCli,
} from './interaction-regression-cli.mjs';
import { changedSnapshot, sampleSnapshot, sampleCoveragePolicy,
  copy } from './interaction-regression-fixtures.mjs';

async function withFiles(callback) {
  const root = await mkdtemp(join(tmpdir(), 'offline-regression-'));
  const before = join(root, 'before.json');
  const after = join(root, 'after.json');
  const policy = join(root, 'policy.json');
  try {
    await writeFile(before, JSON.stringify(sampleSnapshot('a')));
    await writeFile(after, JSON.stringify(changedSnapshot('FAIL', 'b')));
    await writeFile(policy, JSON.stringify(sampleCoveragePolicy()));
    return await callback({ root, before, after, policy });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
function fakeIo() {
  const out = [];
  const err = [];
  return {
    out, err,
    stdout: { write: (part) => { out.push(part); return true; } },
    stderr: { write: (part) => { err.push(part); return true; } },
  };
}

test('CLI parser declares exactly its supported flags', () => {
  assert.ok(CLI_OPTIONS.includes('--before'));
  assert.ok(CLI_OPTIONS.includes('--after'));
  assert.ok(CLI_OPTIONS.includes('--format'));
  assert.ok(!CLI_OPTIONS.includes('--schedule'));
});
test('help is a manual local command, not a scheduled worker', () => {
  assert.equal(parseCliArguments(['--help']).help, true);
  assert.ok(cliHelp().includes('--before FILE'));
  assert.ok(cliHelp().includes('--after FILE'));
  assert.ok(cliHelp().includes('does not fetch URLs'));
});
test('required input paths cannot be omitted', () => {
  assert.equal(parseCliArguments([]).ok, false);
  assert.equal(parseCliArguments(['--before', 'a.json']).ok, false);
  assert.equal(parseCliArguments(['--after', 'b.json']).ok, false);
});
test('duplicate or unknown CLI switches are refused', () => {
  assert.equal(parseCliArguments(['--before', 'a', '--after', 'b', '--before', 'c']).ok, false);
  assert.equal(parseCliArguments(['--before', 'a', '--after', 'b', '--magic', 'yes']).ok, false);
  assert.equal(parseCliArguments(['--before', 'a', '--after', 'a']).ok, false);
});
test('locale and format flags are bounded', () => {
  const argumentsBase = ['--before', 'a', '--after', 'b'];
  assert.equal(parseCliArguments([...argumentsBase, '--language', 'fr']).ok, true);
  assert.equal(parseCliArguments([...argumentsBase, '--language', 'es']).ok, false);
  assert.equal(parseCliArguments([...argumentsBase, '--format', 'pdf']).ok, false);
  assert.equal(parseCliArguments([...argumentsBase, '--format', 'csv']).ok, true);
});
test('safe local input reader works for regular JSON files', async () => {
  await withFiles(async ({ before }) => {
    const text = await readSafeInput(before);
    assert.equal(JSON.parse(text).version, 1);
  });
});
test('reader refuses nonfiles and nonexistent inputs', async () => {
  await withFiles(async ({ root }) => {
    await assert.rejects(() => readSafeInput(root));
    await assert.rejects(() => readSafeInput(join(root, 'missing.json')));
  });
});
test('reader refuses symlink files and symlink parents', async () => {
  await withFiles(async ({ root, before }) => {
    const link = join(root, 'link.json');
    await symlink(before, link);
    await assert.rejects(() => readSafeInput(link));
    const directory = join(root, 'linked');
    await symlink(root, directory);
    await assert.rejects(() => readSafeInput(join(directory, 'before.json')));
  });
});
test('reader refuses oversized files before parsing them', async () => {
  await withFiles(async ({ before }) => {
    await assert.rejects(() => readSafeInput(before, 3));
  });
});
test('create-only output creates owner-readable files', async () => {
  await withFiles(async ({ root }) => {
    const target = join(root, 'report.txt');
    await writeNewFile(target, 'Local report\n');
    assert.equal(await readFile(target, 'utf8'), 'Local report\n');
    const info = await stat(target);
    assert.equal(info.mode & 0o077, 0);
    await assert.rejects(() => writeNewFile(target, 'overwrite'));
  });
});
test('create-only output refuses hidden files and link parents', async () => {
  await withFiles(async ({ root }) => {
    await assert.rejects(() => writeNewFile(join(root, '.hidden'), 'text'));
    await mkdir(join(root, 'real'));
    await symlink(join(root, 'real'), join(root, 'link'));
    await assert.rejects(() => writeNewFile(join(root, 'link', 'out.txt'), 'text'));
  });
});
test('recorded regression exits 1 with a complete text report', async () => {
  await withFiles(async ({ before, after }) => {
    const io = fakeIo();
    const code = await runRegressionCli(['--before', before, '--after', after], io);
    assert.equal(code, 0);
    assert.ok(io.out.join('').includes('UNKNOWN'));
    assert.equal(io.err.length, 0);
  });
});
test('PASS-to-FAIL recorded regression exits nonzero', async () => {
  await withFiles(async ({ before, after }) => {
    const prior = changedSnapshot('PASS', 'a');
    const later = changedSnapshot('FAIL', 'b');
    await writeFile(before, JSON.stringify(prior));
    await writeFile(after, JSON.stringify(later));
    const io = fakeIo();
    const code = await runRegressionCli(['--before', before, '--after', after], io);
    assert.equal(code, 1);
    assert.ok(io.out.join('').includes('Blocking changes'));
  });
});
test('CLI includes optional coverage report from local policy', async () => {
  await withFiles(async ({ before, after, policy }) => {
    const io = fakeIo();
    const code = await runRegressionCli(['--before', before, '--after', after,
      '--policy', policy, '--language', 'fr', '--format', 'csv'], io);
    assert.equal(code, 0);
    assert.ok(io.out.join('').includes('"Catégorie de contrôle"'));
  });
});
test('invalid source file exits 2 without a misleading summary', async () => {
  await withFiles(async ({ before, after }) => {
    const invalid = copy(sampleSnapshot());
    invalid.runs[0].checks[0].licence = '';
    await writeFile(before, JSON.stringify(invalid));
    const io = fakeIo();
    const code = await runRegressionCli(['--before', before, '--after', after], io);
    assert.equal(code, 2);
    assert.equal(io.out.length, 0);
    assert.ok(io.err.join('').includes('validation failed'));
  });
});
test('CLI refuses overwriting an existing output', async () => {
  await withFiles(async ({ root, before, after }) => {
    const target = join(root, 'existing.txt');
    await writeFile(target, 'Leave intact');
    const io = fakeIo();
    const code = await runRegressionCli(['--before', before, '--after', after,
      '--output', target], io);
    assert.equal(code, 2);
    assert.equal(await readFile(target, 'utf8'), 'Leave intact');
  });
});
test('direct Node CLI executes independently of a browser', async () => {
  await withFiles(async ({ before, after }) => {
    const result = spawnSync(process.execPath, [
      new URL('./interaction-regression-cli.mjs', import.meta.url).pathname,
      '--before', before, '--after', after, '--format', 'json',
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLI_OPTIONS, parseCliArgs, usage, readRegisterFile, writeNewReport, runConflictCli,
} from './offline-conflict-cli.mjs';
import { DAY, record, register, sample } from './offline-conflict-fixtures.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const executable = join(here, 'offline-conflict-cli.mjs');
function fakeIo() {
  const out = [], err = [];
  return { stdout: { write: value => { out.push(value); return true; } },
    stderr: { write: value => { err.push(value); return true; } }, out, err };
}
async function withDir(callback) {
  const dir = await mkdtemp(join(tmpdir(), 'conflict-review-'));
  try {
    await writeFile(join(dir, 'input.json'), JSON.stringify(sample()));
    await writeFile(join(dir, 'before.json'), JSON.stringify(register(record('r1', { state: 'YES' }))));
    return await callback(dir);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('CLI option vocabulary has no duplicates', () => {
  assert.equal(new Set(CLI_OPTIONS).size, CLI_OPTIONS.length);
  assert.ok(CLI_OPTIONS.includes('--input'));
});
test('help works without input path', () => {
  assert.deepEqual(parseCliArgs(['--help']), { ok: true, help: true });
});
test('usage text identifies the local manual tool', () => {
  assert.ok(usage().includes('offline-conflict-cli.mjs'));
});
test('usage text exposes the two supported locales', () => {
  assert.ok(usage().includes('--lang en|fr'));
});
test('empty args reject a missing input', () => {
  assert.equal(parseCliArgs([]).error, 'INPUT_REQUIRED');
});
test('unknown option is rejected', () => {
  assert.equal(parseCliArgs(['--input', 'a', '--random', 'b']).error, 'OPTION');
});
test('duplicate option is rejected', () => {
  assert.equal(parseCliArgs(['--input', 'a', '--input', 'b']).error, 'OPTION');
});
test('option missing value is rejected', () => {
  assert.equal(parseCliArgs(['--input']).error, 'VALUE');
});
test('option followed by another flag is rejected', () => {
  assert.equal(parseCliArgs(['--input', '--lang', 'fr']).error, 'VALUE');
});
test('non-string arguments fail closed', () => {
  assert.equal(parseCliArgs([42]).ok, false);
});
test('default format is plain text', () => {
  assert.equal(parseCliArgs(['--input', 'a']).format, 'text');
});
test('default language is English', () => {
  assert.equal(parseCliArgs(['--input', 'a']).language, 'en');
});
test('explicit French locale is accepted', () => {
  assert.equal(parseCliArgs(['--input', 'a', '--lang', 'fr']).language, 'fr');
});
test('unsupported locale fails closed', () => {
  assert.equal(parseCliArgs(['--input', 'a', '--lang', 'es']).error, 'LANGUAGE');
});
test('unsupported format fails closed', () => {
  assert.equal(parseCliArgs(['--input', 'a', '--format', 'pdf']).error, 'FORMAT');
});
test('a previous release requires text output', () => {
  assert.equal(parseCliArgs(['--input', 'a', '--before', 'b', '--format', 'json']).error, 'DELTA_FORMAT');
});
test('an explicit previous release with text output is allowed', () => {
  const result = parseCliArgs(['--input', 'a', '--before', 'b', '--format', 'text']);
  assert.equal(result.ok, true);
  assert.equal(result.previous, 'b');
});
test('the CLI uses no hidden default date', () => {
  assert.equal(parseCliArgs(['--input', 'a']).today, null);
});
test('provided reference date is carried through as text', () => {
  assert.equal(parseCliArgs(['--input', 'a', '--today', DAY]).today, DAY);
});
test('readRegisterFile loads a valid local JSON document', async () => {
  await withDir(async dir => {
    const output = await readRegisterFile(join(dir, 'input.json'), { today: DAY });
    assert.equal(output.ok, true);
    assert.equal(output.value.records[0].state, 'UNKNOWN');
  });
});
test('readRegisterFile does not follow a symlink to a file', async () => {
  await withDir(async dir => {
    await symlink(join(dir, 'input.json'), join(dir, 'linked.json'));
    const output = await readRegisterFile(join(dir, 'linked.json'));
    assert.equal(output.ok, false);
    assert.equal(output.problems[0].code, 'FILE_PATH');
  });
});
test('readRegisterFile does not follow a symlinked parent directory', async () => {
  await withDir(async dir => {
    const nested = join(dir, 'nested'); await mkdir(nested);
    await writeFile(join(nested, 'source.json'), JSON.stringify(sample()));
    await symlink(nested, join(dir, 'alias'));
    assert.equal((await readRegisterFile(join(dir, 'alias', 'source.json'))).ok, false);
  });
});
test('readRegisterFile rejects missing input', async () => {
  await withDir(async dir => {
    assert.equal((await readRegisterFile(join(dir, 'not-found.json'))).ok, false);
  });
});
test('readRegisterFile rejects directories in place of files', async () => {
  await withDir(async dir => {
    assert.equal((await readRegisterFile(dir)).ok, false);
  });
});
test('readRegisterFile rejects malformed JSON', async () => {
  await withDir(async dir => {
    await writeFile(join(dir, 'bad.json'), '{');
    assert.equal((await readRegisterFile(join(dir, 'bad.json'))).ok, false);
  });
});
test('readRegisterFile rejects invalid provenance', async () => {
  await withDir(async dir => {
    await writeFile(join(dir, 'bad.json'), JSON.stringify(register(record('a', { licence: null }))));
    assert.equal((await readRegisterFile(join(dir, 'bad.json'))).ok, false);
  });
});
test('readRegisterFile rejects huge byte inputs before JSON parsing', async () => {
  await withDir(async dir => {
    await writeFile(join(dir, 'big.json'), 'x'.repeat(8_000_001));
    assert.equal((await readRegisterFile(join(dir, 'big.json'))).ok, false);
  });
});
test('writeNewReport uses create-only semantics', async () => {
  await withDir(async dir => {
    const target = join(dir, 'report.txt');
    assert.equal(await writeNewReport(target, 'safe'), true);
    assert.equal(await writeNewReport(target, 'overwrite'), false);
    assert.equal(await readFile(target, 'utf8'), 'safe');
  });
});
test('writeNewReport refuses to overwrite an existing source file', async () => {
  await withDir(async dir => {
    assert.equal(await writeNewReport(join(dir, 'input.json'), 'overwrite'), false);
    assert.equal(JSON.parse(await readFile(join(dir, 'input.json'), 'utf8')).version, 1);
  });
});
test('writeNewReport refuses a symlink target', async () => {
  await withDir(async dir => {
    await symlink(join(dir, 'input.json'), join(dir, 'alias.json'));
    assert.equal(await writeNewReport(join(dir, 'alias.json'), 'overwrite'), false);
  });
});
test('writeNewReport refuses a symlink parent', async () => {
  await withDir(async dir => {
    await mkdir(join(dir, 'dest'));
    await symlink(join(dir, 'dest'), join(dir, 'alias'));
    assert.equal(await writeNewReport(join(dir, 'alias', 'report.txt'), 'safe'), false);
  });
});
test('writeNewReport rejects missing parent directory', async () => {
  await withDir(async dir => {
    assert.equal(await writeNewReport(join(dir, 'missing', 'report.txt'), 'safe'), false);
  });
});
test('writeNewReport rejects non-string content', async () => {
  await withDir(async dir => {
    assert.equal(await writeNewReport(join(dir, 'output.txt'), Buffer.from('x')), false);
  });
});
test('writeNewReport sets private owner-only file mode on POSIX', async () => {
  await withDir(async dir => {
    const path = join(dir, 'output.txt');
    assert.equal(await writeNewReport(path, 'safe'), true);
    const meta = await stat(path);
    assert.equal(meta.mode & 0o077, 0);
  });
});
test('stdout text export is deterministic', async () => {
  await withDir(async dir => {
    const io = fakeIo();
    const status = await runConflictCli(['--input', join(dir, 'input.json')], io);
    assert.equal(status, 0);
    assert.ok(io.out.join('').includes('UNKNOWN'));
    assert.equal(io.err.length, 0);
  });
});
test('stdout French export localizes headers', async () => {
  await withDir(async dir => {
    const io = fakeIo();
    assert.equal(await runConflictCli(['--input', join(dir, 'input.json'), '--lang', 'fr'], io), 0);
    assert.ok(io.out.join('').includes('Fiche\u00a0:'));
  });
});
test('CSV output is valid quoted text and can be written locally', async () => {
  await withDir(async dir => {
    const output = join(dir, 'report.csv'); const io = fakeIo();
    assert.equal(await runConflictCli(['--input', join(dir, 'input.json'), '--format', 'csv', '--output', output], io), 0);
    assert.ok((await readFile(output, 'utf8')).startsWith('"Record","Subject"'));
    assert.equal(io.out.length, 0);
  });
});
test('HTML export uses French locale and scoped column headings', async () => {
  await withDir(async dir => {
    const io = fakeIo();
    assert.equal(await runConflictCli(['--input', join(dir, 'input.json'), '--format', 'html', '--lang', 'fr'], io), 0);
    assert.ok(io.out.join('').includes('lang="fr"'));
    assert.ok(io.out.join('').includes('<th scope="col">'));
  });
});
test('JSON export retains UNKNOWN in rows', async () => {
  await withDir(async dir => {
    const io = fakeIo();
    assert.equal(await runConflictCli(['--input', join(dir, 'input.json'), '--format', 'json'], io), 0);
    assert.equal(JSON.parse(io.out.join('')).rows[0].outcome, 'UNKNOWN');
  });
});
test('before/after comparison identifies changed claim without approval', async () => {
  await withDir(async dir => {
    const io = fakeIo();
    assert.equal(await runConflictCli(['--before', join(dir, 'before.json'), '--input', join(dir, 'input.json')], io), 0);
    assert.ok(io.out.join('').includes('UNKNOWN'));
    assert.ok(io.out.join('').includes('Recorded changes:'));
  });
});
test('invalid source does not produce report output', async () => {
  await withDir(async dir => {
    const io = fakeIo();
    assert.equal(await runConflictCli(['--input', join(dir, 'missing.json')], io), 2);
    assert.equal(io.out.length, 0);
  });
});
test('invalid earlier input does not generate a clean comparison', async () => {
  await withDir(async dir => {
    const io = fakeIo();
    assert.equal(await runConflictCli(['--before', join(dir, 'missing.json'), '--input', join(dir, 'input.json')], io), 2);
    assert.equal(io.out.length, 0);
  });
});
test('CLI fails rather than overwrites an existing report', async () => {
  await withDir(async dir => {
    const output = join(dir, 'saved.txt'); await writeFile(output, 'original');
    const io = fakeIo();
    assert.equal(await runConflictCli(['--input', join(dir, 'input.json'), '--output', output], io), 2);
    assert.equal(await readFile(output, 'utf8'), 'original');
  });
});
test('CLI refuses invalid command arguments', async () => {
  const io = fakeIo();
  assert.equal(await runConflictCli(['--unknown', 'x'], io), 2);
  assert.ok(io.err.join('').includes('Usage:'));
});
test('CLI help is available without filesystem access', async () => {
  const io = fakeIo();
  assert.equal(await runConflictCli(['--help'], io), 0);
  assert.ok(io.out.join('').includes('Usage:'));
});
test('direct executable returns zero on valid local fixture', async () => {
  await withDir(async dir => {
    const run = spawnSync(process.execPath, [executable, '--input', join(dir, 'input.json')], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes('UNKNOWN'));
  });
});
test('direct executable rejects malformed source with nonzero status', async () => {
  await withDir(async dir => {
    const run = spawnSync(process.execPath, [executable, '--input', join(dir, 'missing.json')], { encoding: 'utf8' });
    assert.equal(run.status, 2);
  });
});

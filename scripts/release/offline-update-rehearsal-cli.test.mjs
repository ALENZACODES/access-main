import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { CLI_ACTIONS, parseArguments, fileInside, runUpdateRehearsalCli } from './offline-update-rehearsal-cli.mjs';
import { document, session, TODAY } from './offline-update-rehearsal-fixtures.mjs';
function fakeIo(cwd) {
  const out = [];
  const err = [];
  return { cwd, out, err,
    stdout: { write: value => { out.push(value); return true; } },
    stderr: { write: value => { err.push(value); return true; } },
  };
}
async function temporary(run) {
  const root = await mkdtemp(join(tmpdir(), 'update-rehearsal-'));
  try {
    await mkdir(join(root, 'files'));
    await writeFile(join(root, 'old.json'), JSON.stringify(document()));
    await writeFile(join(root, 'new.json'), JSON.stringify(document({ sessions: [session('session-one', { outcome: 'FAIL' })] })));
    return await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
const cli = (args, io) => runUpdateRehearsalCli(args, io);

test('command list has inspect and compare only', () => {
  assert.deepEqual(CLI_ACTIONS, ['inspect', 'compare']);
});
test('help is available without file or network operations', () => {
  assert.equal(parseArguments(['--help']).help, true);
  assert.equal(parseArguments(['-h']).help, true);
});
test('unknown action is rejected', () => {
  assert.equal(parseArguments(['delete']).ok, false);
});
test('inspect action requires input', () => {
  assert.ok(parseArguments(['inspect']).problems.some(x => x.code === 'INPUT_REQUIRED'));
});
test('compare action requires two input paths', () => {
  assert.ok(parseArguments(['compare', '--before', 'a']).problems.some(x => x.code === 'PAIR_REQUIRED'));
});
test('unknown options cannot be silently ignored', () => {
  assert.ok(parseArguments(['inspect', '--input', 'a', '--unknown', 'b']).problems.some(x => x.code === 'ARGUMENT_INVALID'));
});
test('duplicate arguments are rejected', () => {
  assert.equal(parseArguments(['inspect', '--input', 'a', '--input', 'b']).ok, false);
});
test('dangling option arguments are rejected', () => {
  assert.equal(parseArguments(['inspect', '--input']).ok, false);
});
test('option value cannot be another option name', () => {
  assert.equal(parseArguments(['inspect', '--input', '--output']).ok, false);
});
test('inspect cannot mix before/after options', () => {
  assert.equal(parseArguments(['inspect', '--input', 'a', '--before', 'b']).ok, false);
});
test('compare cannot also use a standalone input', () => {
  assert.equal(parseArguments(['compare', '--before', 'a', '--after', 'b', '--input', 'c']).ok, false);
});
test('language selection is explicitly bilingual', () => {
  assert.equal(parseArguments(['inspect', '--input', 'a', '--locale', 'fr']).options.language, 'fr');
  assert.equal(parseArguments(['inspect', '--input', 'a', '--locale', 'es']).ok, false);
});
test('format selection matches supported report formats', () => {
  assert.equal(parseArguments(['inspect', '--input', 'a', '--format', 'csv']).options.format, 'csv');
  assert.equal(parseArguments(['inspect', '--input', 'a', '--format', 'pdf']).ok, false);
});
test('comparison currently permits only plain-text reports', () => {
  assert.equal(parseArguments(['compare', '--before', 'a', '--after', 'b', '--format', 'csv']).ok, false);
});
test('reference date rejects invalid leap days', () => {
  assert.equal(parseArguments(['inspect', '--input', 'a', '--today', '2025-02-29']).ok, false);
  assert.equal(parseArguments(['inspect', '--input', 'a', '--today', '2024-02-29']).ok, true);
});
test('default arguments do not invent an explicit reference date', () => {
  const result = parseArguments(['inspect', '--input', 'file.json']);
  assert.equal(result.ok, true);
  assert.equal(result.options.today, undefined);
});
test('fileWithin accepts paths inside the supplied working directory', () => {
  assert.equal(fileInside('/tmp/rehearsal', 'files/a.json'), true);
  assert.equal(fileInside('/tmp/rehearsal', './a.json'), true);
});
test('fileWithin rejects path traversal outside the working directory', () => {
  assert.equal(fileInside('/tmp/rehearsal', '../outside.json'), false);
  assert.equal(fileInside('/tmp/rehearsal', '/etc/passwd'), false);
});
test('fileWithin rejects null byte paths', () => {
  assert.equal(fileInside('/tmp/rehearsal', 'a\0b'), false);
});
test('the inspect CLI prints review findings for a synthetic fixture', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--today', TODAY], io), 0);
    assert.ok(io.out.join('').includes('UNKNOWN'));
    assert.equal(io.err.length, 0);
  });
});
test('the inspect CLI chooses French text copy', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--locale', 'fr'], io), 0);
    assert.ok(io.out.join('').includes('Séances\u00A0:'));
  });
});
test('the inspect CLI writes JSON when explicitly requested', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--format', 'json'], io), 0);
    assert.equal(JSON.parse(io.out.join('')).version, 1);
  });
});
test('the inspect CLI writes localized CSV headers', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--format', 'csv', '--locale', 'fr'], io), 0);
    assert.ok(io.out.join('').startsWith('"Identifiant"'));
  });
});
test('the inspect CLI writes an accessible HTML document', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--format', 'html'], io), 0);
    assert.ok(io.out.join('').includes('<html lang="en">'));
  });
});
test('comparison shows a changed recorded outcome', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    const code = await cli(['compare', '--before', 'old.json', '--after', 'new.json'], io);
    assert.equal(code, 0);
    assert.ok(io.out.join('').includes('session-outcome'));
  });
});
test('comparison can use French labels', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['compare', '--before', 'old.json', '--after', 'new.json', '--locale', 'fr'], io), 0);
    assert.ok(io.out.join('').includes('Différences entre publications'));
  });
});
test('file output uses create-only semantics', async () => {
  await temporary(async root => {
    await writeFile(join(root, 'report.txt'), 'untouched');
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--output', 'report.txt'], io), 2);
    assert.equal(await readFile(join(root, 'report.txt'), 'utf8'), 'untouched');
  });
});
test('new report files use owner-only access permissions', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--output', 'report.txt'], io), 0);
    const info = await stat(join(root, 'report.txt'));
    assert.equal(info.mode & 0o077, 0);
  });
});
test('output path may not equal the input path', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--output', 'old.json'], io), 2);
    assert.ok(JSON.parse(await readFile(join(root, 'old.json'), 'utf8')));
  });
});
test('output path cannot traverse out of the working root', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--output', '../other.txt'], io), 2);
  });
});
test('input path cannot traverse out of the working root', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', '../../outside.json'], io), 2);
  });
});
test('input symlinks are rejected without reading their target', async () => {
  await temporary(async root => {
    await symlink(join(root, 'old.json'), join(root, 'link.json'));
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'link.json'], io), 2);
  });
});
test('input symlinked parent directories are rejected', async () => {
  await temporary(async root => {
    await symlink(join(root, 'files'), join(root, 'linked-dir'));
    await writeFile(join(root, 'files', 'a.json'), JSON.stringify(document()));
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'linked-dir/a.json'], io), 2);
  });
});
test('output symlinked parent directories are rejected', async () => {
  await temporary(async root => {
    await symlink(join(root, 'files'), join(root, 'linked-dir'));
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--output', 'linked-dir/out.txt'], io), 2);
  });
});
test('missing inputs fail with a nonzero exit code', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'absent.json'], io), 2);
    assert.ok(io.err.length > 0);
  });
});
test('malformed JSON fails without producing an output artifact', async () => {
  await temporary(async root => {
    await writeFile(join(root, 'bad.json'), '{');
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'bad.json', '--output', 'out.txt'], io), 2);
    await assert.rejects(readFile(join(root, 'out.txt')));
  });
});
test('private input fields do not leak in CLI errors', async () => {
  await temporary(async root => {
    await writeFile(join(root, 'bad.json'), JSON.stringify({ ...document(), secret: 'do-not-print' }));
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'bad.json'], io), 2);
    assert.ok(!io.err.join('').includes('do-not-print'));
  });
});
test('output directory must exist rather than being created implicitly', async () => {
  await temporary(async root => {
    const io = fakeIo(root);
    assert.equal(await cli(['inspect', '--input', 'old.json', '--output', 'absent/out.txt'], io), 2);
  });
});
test('help output lists manual commands', async () => {
  const io = fakeIo(resolve('/tmp'));
  assert.equal(await cli(['--help'], io), 0);
  assert.ok(io.out.join('').includes('inspect'));
  assert.ok(io.out.join('').includes('compare'));
});
test('direct executable mode prints help and exits cleanly', () => {
  const file = fileURLToPath(new URL('./offline-update-rehearsal-cli.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [file, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Usage:'));
});
test('direct executable mode returns a nonzero code for invalid arguments', () => {
  const file = fileURLToPath(new URL('./offline-update-rehearsal-cli.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [file, 'unknown-command'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});

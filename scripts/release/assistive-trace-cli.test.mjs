import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { test } from 'node:test';
import { CLI_MODES, parseArgs, safeInput, safeOutput, runCli } from './assistive-trace-cli.mjs';
import { trace, TODAY } from './assistive-trace-fixtures.mjs';

const fakeIo = () => {
  const out = []; const err = [];
  return {
    out, err,
    stdout: { write: (chunk) => { out.push(chunk); return true; } },
    stderr: { write: (chunk) => { err.push(chunk); return true; } },
  };
};
async function temporary(callback) {
  const folder = await mkdtemp(join(tmpdir(), 'assistive-trace-'));
  const file = join(folder, 'trace.json');
  await writeFile(file, JSON.stringify(trace()), 'utf8');
  try { return await callback({ folder, file }); }
  finally { await rm(folder, { recursive: true, force: true }); }
}

test('CLI mode vocabulary remains limited to report and compare', () => {
  assert.deepEqual(CLI_MODES, ['report', 'compare']);
});
test('argument parser requires explicit input', () => {
  assert.equal(parseArgs([]).code, 'INPUT_REQUIRED');
});
test('argument parser accepts text reporting', () => {
  const result = parseArgs(['--input', 'trace.json']);
  assert.equal(result.ok, true);
  assert.equal(result.args.format, 'text');
  assert.equal(result.args.locale, 'en');
});
test('argument parser supports French HTML output', () => {
  const result = parseArgs(['--input', 'trace.json', '--format', 'html', '--locale', 'fr']);
  assert.equal(result.ok, true);
  assert.equal(result.args.format, 'html');
  assert.equal(result.args.locale, 'fr');
});
test('argument parser refuses unrecognized switches', () => {
  assert.equal(parseArgs(['--send', 'https://example.org']).code, 'ARGUMENT_UNKNOWN');
});
test('argument parser refuses missing switch arguments', () => {
  assert.equal(parseArgs(['--input']).code, 'ARGUMENT_VALUE');
  assert.equal(parseArgs(['--input', '--locale', 'fr']).code, 'ARGUMENT_VALUE');
});
test('argument parser refuses invalid format', () => {
  assert.equal(parseArgs(['--input', 'a', '--format', 'pdf']).code, 'FORMAT_INVALID');
});
test('argument parser refuses unsupported language', () => {
  assert.equal(parseArgs(['--input', 'a', '--locale', 'es']).code, 'LOCALE_INVALID');
});
test('argument parser requires JSON for comparisons', () => {
  assert.equal(parseArgs(['--input', 'a', '--previous', 'b']).code, 'COMPARE_JSON_ONLY');
});
test('argument parser permits explicit JSON comparison', () => {
  const result = parseArgs(['--input', 'a', '--previous', 'b', '--format', 'json']);
  assert.equal(result.ok, true);
});
test('argument parser refuses repeated path flags', () => {
  assert.equal(parseArgs(['--input', 'a', '--input', 'b']).code, 'ARGUMENT_DUPLICATE');
});
test('argument parser help needs no input file', () => {
  assert.equal(parseArgs(['--help']).ok, true);
});
test('safeInput reads an ordinary local JSON file', async () => {
  await temporary(async ({ file }) => {
    const result = await safeInput(file);
    assert.equal(result.ok, true);
    assert.ok(result.text.includes('"journeys"'));
  });
});
test('safeInput refuses directory paths', async () => {
  await temporary(async ({ folder }) => {
    assert.equal((await safeInput(folder)).ok, false);
  });
});
test('safeInput refuses nonexistent files', async () => {
  await temporary(async ({ folder }) => {
    assert.equal((await safeInput(join(folder, 'missing.json'))).code, 'INPUT_READ');
  });
});
test('safeInput refuses direct symbolic links', async () => {
  await temporary(async ({ file, folder }) => {
    const link = join(folder, 'alias.json');
    await symlink(file, link);
    assert.equal((await safeInput(link)).code, 'INPUT_UNSAFE');
  });
});
test('safeInput refuses symlinked parent directory', async () => {
  await temporary(async ({ file, folder }) => {
    const link = join(folder, 'alias');
    await symlink(folder, link, 'dir');
    const result = await safeInput(join(link, 'trace.json'));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INPUT_UNSAFE');
    assert.ok(file.endsWith('trace.json'));
  });
});
test('safeInput rejects oversized files before loading', async () => {
  await temporary(async ({ folder }) => {
    const large = join(folder, 'large.json');
    await writeFile(large, 'x'.repeat(8_000_001));
    assert.equal((await safeInput(large)).code, 'INPUT_UNSAFE');
  });
});
test('safeOutput writes with exclusive create flag', async () => {
  await temporary(async ({ folder }) => {
    const output = join(folder, 'report.txt');
    assert.equal((await safeOutput(output, 'report')).ok, true);
    assert.equal(await readFile(output, 'utf8'), 'report');
  });
});
test('safeOutput refuses overwrite of existing file', async () => {
  await temporary(async ({ file }) => {
    assert.equal((await safeOutput(file, 'replace')).code, 'OUTPUT_WRITE');
    assert.ok((await readFile(file, 'utf8')).includes('"version"'));
  });
});
test('safeOutput refuses dotfile output', async () => {
  await temporary(async ({ folder }) => {
    const result = await safeOutput(join(folder, '.hidden'), 'text');
    assert.equal(result.code, 'OUTPUT_UNSAFE');
  });
});
test('safeOutput creates owner-only file mode on POSIX', async () => {
  await temporary(async ({ folder }) => {
    const output = join(folder, 'new.txt');
    assert.equal((await safeOutput(output, 'hello')).ok, true);
    const stat = await lstat(output);
    assert.equal(stat.mode & 0o777 & 0o077, 0);
  });
});
test('safeOutput refuses symlinked parent path', async () => {
  await temporary(async ({ folder }) => {
    const alias = join(folder, 'alias');
    await symlink(folder, alias, 'dir');
    assert.equal((await safeOutput(join(alias, 'report.txt'), 'text')).code, 'OUTPUT_UNSAFE');
  });
});
test('safeOutput rejects missing output directory', async () => {
  await temporary(async ({ folder }) => {
    assert.equal((await safeOutput(join(folder, 'missing', 'x.txt'), 'text')).ok, false);
  });
});
test('CLI help writes an informational message only', async () => {
  const io = fakeIo();
  assert.equal(await runCli(['--help'], io), 0);
  assert.ok(io.out.join('').includes('--input'));
  assert.deepEqual(io.err, []);
});
test('CLI missing input fails with code 2', async () => {
  const io = fakeIo();
  assert.equal(await runCli([], io), 2);
  assert.ok(io.err.join('').includes('INPUT_REQUIRED'));
});
test('CLI generates an English text report', async () => {
  await temporary(async ({ file }) => {
    const io = fakeIo();
    assert.equal(await runCli(['--input', file, '--today', TODAY], io), 0);
    assert.ok(io.out.join('').includes('Offline assistive-technology trace review'));
  });
});
test('CLI generates a French text report', async () => {
  await temporary(async ({ file }) => {
    const io = fakeIo();
    assert.equal(await runCli(['--input', file, '--locale', 'fr'], io), 0);
    assert.ok(io.out.join('').includes('Examen hors ligne'));
    assert.ok(io.out.join('').includes('Source\u00A0:'));
  });
});
test('CLI can generate localized CSV', async () => {
  await temporary(async ({ file }) => {
    const io = fakeIo();
    assert.equal(await runCli(['--input', file, '--format', 'csv', '--locale', 'fr'], io), 0);
    assert.ok(io.out.join('').includes('"Langue"'));
  });
});
test('CLI can generate accessible HTML', async () => {
  await temporary(async ({ file }) => {
    const io = fakeIo();
    assert.equal(await runCli(['--input', file, '--format', 'html', '--locale', 'fr'], io), 0);
    assert.ok(io.out.join('').includes('<html lang="fr">'));
  });
});
test('CLI outputs JSON comparison of identical traces', async () => {
  await temporary(async ({ file }) => {
    const io = fakeIo();
    assert.equal(await runCli(['--input', file, '--previous', file, '--format', 'json'], io), 0);
    assert.deepEqual(JSON.parse(io.out.join('')).changes, []);
  });
});
test('CLI creates an output file rather than writing stdout', async () => {
  await temporary(async ({ folder, file }) => {
    const io = fakeIo(); const output = join(folder, 'report.txt');
    assert.equal(await runCli(['--input', file, '--output', output], io), 0);
    assert.deepEqual(io.out, []);
    assert.ok((await readFile(output, 'utf8')).includes('Human review worklist'));
  });
});
test('CLI never replaces existing report output', async () => {
  await temporary(async ({ file, folder }) => {
    const output = join(folder, 'report.txt');
    await writeFile(output, 'preserve');
    const io = fakeIo();
    assert.equal(await runCli(['--input', file, '--output', output], io), 2);
    assert.equal(await readFile(output, 'utf8'), 'preserve');
  });
});
test('CLI rejects an invalid document without exporting partial content', async () => {
  await temporary(async ({ file }) => {
    await writeFile(file, '{');
    const io = fakeIo();
    assert.equal(await runCli(['--input', file], io), 2);
    assert.deepEqual(io.out, []);
    assert.ok(io.err.join('').includes('INPUT_JSON'));
  });
});
test('CLI rejects missing source licence', async () => {
  await temporary(async ({ file }) => {
    const data = trace(); delete data.sources[0].licence;
    await writeFile(file, JSON.stringify(data));
    const io = fakeIo();
    assert.equal(await runCli(['--input', file], io), 2);
    assert.ok(io.err.join('').includes('SOURCE_LICENCE'));
  });
});
test('CLI rejects malformed preceding snapshot', async () => {
  await temporary(async ({ folder, file }) => {
    const earlier = join(folder, 'bad.json');
    await writeFile(earlier, '{');
    const io = fakeIo();
    assert.equal(await runCli(['--input', file, '--previous', earlier, '--format', 'json'], io), 2);
  });
});
test('CLI rejects unsupported locale before reading input', async () => {
  const io = fakeIo();
  assert.equal(await runCli(['--input', 'missing', '--locale', 'es'], io), 2);
  assert.ok(io.err.join('').includes('LOCALE_INVALID'));
});
test('CLI works when launched in its own Node process', async () => {
  await temporary(async ({ file }) => {
    const script = new URL('./assistive-trace-cli.mjs', import.meta.url);
    const run = spawnSync(process.execPath, [script.pathname, '--input', file, '--format', 'json'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(JSON.parse(run.stdout).cells.length > 0);
  });
});
test('CLI creates report files in an explicit subdirectory', async () => {
  await temporary(async ({ folder, file }) => {
    const directory = join(folder, 'reports');
    await mkdir(directory);
    const io = fakeIo(); const output = join(directory, 'report.json');
    assert.equal(await runCli(['--input', file, '--output', output, '--format', 'json'], io), 0);
    assert.ok(JSON.parse(await readFile(output, 'utf8')).fingerprint);
  });
});

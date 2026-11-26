import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, symlink, lstat, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs, readLocalFile, writeLocalFile, execute } from './reference-cli.mjs';
import { DAY, snapshot, entry, observed } from './reference-fixtures.mjs';

const args = (extras = []) => ['--after', 'fictional-after.json', '--today', DAY, ...extras];
const output = () => {
  let out = '', err = '';
  return { stdout: { write(s) { out += s; } }, stderr: { write(s) { err += s; } }, read() { return { out, err }; } };
};
const run = async (argv, content = JSON.stringify(snapshot())) => {
  const io = output();
  const code = await execute(argv, { read: async () => content, write: async () => {}, stdout: io.stdout, stderr: io.stderr });
  return { code, ...io.read() };
};

test('explicit after-file argument is required', () => {
  assert.equal(parseArgs(['--today', DAY]).ok, false);
});
test('empty argument vector is rejected', () => {
  assert.equal(parseArgs([]).ok, false);
});
test('missing value on the last flag is rejected', () => {
  assert.equal(parseArgs([...args(), '--format']).ok, false);
});
test('unrecognized flag is rejected', () => {
  assert.equal(parseArgs(args(['--run-network', 'yes'])).ok, false);
});
test('duplicate flags are rejected rather than silently overwritten', () => {
  assert.equal(parseArgs(args(['--today', DAY])).ok, false);
});
test('empty value is rejected', () => {
  assert.equal(parseArgs(args(['--format', ''])).ok, false);
});
test('supported language values are English and French', () => {
  assert.equal(parseArgs(args(['--language', 'en'])).ok, true);
  assert.equal(parseArgs(args(['--language', 'fr'])).ok, true);
});
test('non-supported language is rejected', () => {
  assert.equal(parseArgs(args(['--language', 'es'])).ok, false);
});
test('HTML, text, JSON and CSV output forms are supported', () => {
  for (const format of ['html', 'text', 'json', 'csv']) assert.equal(parseArgs(args(['--format', format])).ok, true);
});
test('unsupported output format is rejected', () => {
  assert.equal(parseArgs(args(['--format', 'yaml'])).ok, false);
});
test('relative output paths are permitted for a new local file', () => {
  assert.equal(parseArgs(args(['--output', 'report.txt'])).ok, true);
});
test('the output cannot replace the after input', () => {
  assert.equal(parseArgs(args(['--output', 'fictional-after.json'])).problem, 'OUTPUT_EQUALS_INPUT');
});
test('the output cannot replace the before input', () => {
  assert.equal(parseArgs(args(['--before', 'old.json', '--output', 'old.json'])).problem, 'OUTPUT_EQUALS_INPUT');
});
test('before and after cannot be the same local file', () => {
  assert.equal(parseArgs(args(['--before', 'fictional-after.json'])).problem, 'DUPLICATE_INPUT');
});
test('a valid before path is permitted', () => {
  assert.equal(parseArgs(args(['--before', 'old.json'])).ok, true);
});
test('stale days is a strict positive integer', () => {
  for (const value of ['0', '-1', '1.2', 'abcd', '3651', '5000']) assert.equal(parseArgs(args(['--stale-days', value])).ok, false);
});
test('stale-days policy accepts bounded values', () => {
  for (const value of ['1', '180', '3650']) assert.equal(parseArgs(args(['--stale-days', value])).ok, true);
});
test('an invalid today date is rejected', () => {
  assert.equal(parseArgs(args(['--today', '2026-02-30'])).ok, false);
});
test('no output flag renders text to stdout by default', async () => {
  const result = await run(args());
  assert.equal(result.code, 0);
  assert.match(result.out, /Outbound reference review/u);
});
test('French output renders translated title', async () => {
  const result = await run(args(['--language', 'fr']));
  assert.equal(result.code, 0);
  assert.match(result.out, /Examen des liens externes/u);
});
test('JSON format output is machine readable', async () => {
  const result = await run(args(['--format', 'json']));
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.out).report.total, 1);
});
test('CSV format includes a safe quoted header', async () => {
  const result = await run(args(['--format', 'csv']));
  assert.equal(result.code, 0);
  assert.match(result.out, /^"reference","code"/u);
});
test('HTML output contains a main landmark and language', async () => {
  const result = await run(args(['--format', 'html', '--language', 'fr']));
  assert.equal(result.code, 0);
  assert.match(result.out, /<html lang="fr">/u);
  assert.match(result.out, /<main>/u);
});
test('the command refuses to turn unknown status into a positive signal', async () => {
  const result = await run(args());
  assert.match(result.out, /STATUS_UNKNOWN/u);
});
test('malformed after JSON returns a nonzero code', async () => {
  const result = await run(args(), '{not-json');
  assert.equal(result.code, 2);
  assert.match(result.err, /AFTER:input:JSON/u);
});
test('invalid after schema returns a nonzero code', async () => {
  const result = await run(args(), JSON.stringify({ schemaVersion: 9, capturedOn: DAY, references: [] }));
  assert.equal(result.code, 2);
  assert.match(result.err, /AFTER:schemaVersion:VERSION/u);
});
test('invalid arguments return an exit code without reading files', async () => {
  const io = output();
  let reads = 0;
  const code = await execute(['--invalid', 'yes'], { read: async () => { reads++; }, stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 2);
  assert.equal(reads, 0);
});
test('a locally thrown read error is reported as local IO', async () => {
  const io = output();
  const code = await execute(args(), { read: async () => { throw Error('UNSAFE_INPUT'); }, stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 2);
  assert.match(io.read().err, /LOCAL_IO:UNSAFE_INPUT/u);
});
test('local output writer is only called on a valid snapshot', async () => {
  const io = output();
  let writes = 0;
  const code = await execute(args(['--output', 'report.txt']), { read: async () => '{broken', write: async () => { writes++; }, stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 2);
  assert.equal(writes, 0);
});
test('the explicit output writer receives rendered output once', async () => {
  const io = output();
  let writes = 0, content = '';
  const code = await execute(args(['--output', 'report.txt']), { read: async () => JSON.stringify(snapshot()), write: async (_path, text) => { writes++; content = text; }, stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 0);
  assert.equal(writes, 1);
  assert.match(content, /Outbound reference review/u);
  assert.equal(io.read().out, '');
});
test('the CLI compares a before snapshot when explicitly supplied', async () => {
  const io = output();
  const before = snapshot(entry());
  const after = snapshot(observed());
  const code = await execute(args(['--before', 'old.json']), { read: async path => JSON.stringify(path === 'old.json' ? before : after), stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 0);
  assert.match(io.read().out, /Recorded changes/u);
});
test('the CLI rejects an invalid before snapshot', async () => {
  const io = output();
  const code = await execute(args(['--before', 'old.json']), { read: async path => path === 'old.json' ? '{bad' : JSON.stringify(snapshot()), stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 2);
  assert.match(io.read().err, /BEFORE:input:JSON/u);
});
test('the CLI propagates bad output writer errors as local IO', async () => {
  const io = output();
  const code = await execute(args(['--output', 'report.txt']), { read: async () => JSON.stringify(snapshot()), write: async () => { throw Error('EEXIST'); }, stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 2);
  assert.match(io.read().err, /LOCAL_IO:EEXIST/u);
});

async function inDirectory(action) {
  const directory = await mkdtemp(join(tmpdir(), 'reference-review-'));
  try { await action(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
test('local reader accepts an ordinary UTF-8 JSON file', async () => inDirectory(async directory => {
  const path = join(directory, 'input.json');
  await writeFile(path, JSON.stringify(snapshot()));
  const content = await readLocalFile(path);
  assert.equal(JSON.parse(content).schemaVersion, 1);
}));
test('local reader rejects a file that exceeds the byte cap', async () => inDirectory(async directory => {
  const path = join(directory, 'huge.json');
  await writeFile(path, 'x'.repeat(1_048_577));
  await assert.rejects(() => readLocalFile(path), /UNSAFE_INPUT/u);
}));
test('local reader rejects a symlink input', async () => inDirectory(async directory => {
  const path = join(directory, 'input.json');
  const link = join(directory, 'link.json');
  await writeFile(path, JSON.stringify(snapshot()));
  await symlink(path, link);
  await assert.rejects(() => readLocalFile(link), /UNSAFE_INPUT/u);
}));
test('local reader refuses a directory', async () => inDirectory(async directory => {
  await assert.rejects(() => readLocalFile(directory), /UNSAFE_INPUT/u);
}));
test('local reader refuses a path containing a null byte', async () => {
  await assert.rejects(() => readLocalFile('bad\0path'), /UNSAFE_INPUT/u);
});
test('local writer creates a previously absent file', async () => inDirectory(async directory => {
  const path = join(directory, 'output.txt');
  await writeLocalFile(path, 'Fictional report\n');
  assert.equal(await readFile(path, 'utf8'), 'Fictional report\n');
}));
test('local writer does not overwrite existing files', async () => inDirectory(async directory => {
  const path = join(directory, 'output.txt');
  await writeFile(path, 'Keep this content');
  await assert.rejects(() => writeLocalFile(path, 'Replace'), /EEXIST/u);
  assert.equal(await readFile(path, 'utf8'), 'Keep this content');
}));
test('local writer refuses a symlink output', async () => inDirectory(async directory => {
  const target = join(directory, 'target.txt');
  const link = join(directory, 'link.txt');
  await writeFile(target, 'Original');
  await symlink(target, link);
  await assert.rejects(() => writeLocalFile(link, 'Replacement'), /EEXIST/u);
  assert.equal(await readFile(target, 'utf8'), 'Original');
}));
test('local writer defaults to owner-only file permissions', async () => inDirectory(async directory => {
  const path = join(directory, 'new.txt');
  await writeLocalFile(path, 'Sensitive fictional audit');
  const info = await stat(path);
  assert.equal(info.mode & 0o077, 0);
}));
test('local writer refuses a null-byte path', async () => {
  await assert.rejects(() => writeLocalFile('bad\0path', 'text'), /UNSAFE_OUTPUT/u);
});
test('local writer rejects non-string output content', async () => {
  await assert.rejects(() => writeLocalFile('new.txt', null), /UNSAFE_OUTPUT/u);
});
test('local writer writes UTF-8 French punctuation intact', async () => inDirectory(async directory => {
  const path = join(directory, 'fr.txt');
  const content = 'L’examen : UNKNOWN\n';
  await writeLocalFile(path, content);
  assert.equal(await readFile(path, 'utf8'), content);
}));
test('local writer creates a regular file rather than a symlink', async () => inDirectory(async directory => {
  const path = join(directory, 'new.txt');
  await writeLocalFile(path, 'report');
  const info = await lstat(path);
  assert.equal(info.isFile(), true);
  assert.equal(info.isSymbolicLink(), false);
}));
test('no network destination is touched by local injected readers', async () => {
  const io = output();
  let reads = 0;
  const code = await execute(args(), { read: async path => { reads++; assert.equal(path, 'fictional-after.json'); return JSON.stringify(snapshot()); }, stdout: io.stdout, stderr: io.stderr });
  assert.equal(code, 0);
  assert.equal(reads, 1);
});
test('local CLI error returns do not print unvalidated content', async () => {
  const io = output();
  await execute(args(), { read: async () => '<script>unsafe</script>', stdout: io.stdout, stderr: io.stderr });
  assert.doesNotMatch(io.read().err, /<script>/u);
});

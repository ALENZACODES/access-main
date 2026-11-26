import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { args, safeRead, safeWrite, run } from './interaction-evidence-cli.mjs';
import { sample, paired, DATE } from './interaction-evidence-fixtures.mjs';
import { LIMITS } from './interaction-evidence-contract.mjs';
const output = () => {
  const received = { out: '', err: '' };
  const streams = { stdout: { write: part => { received.out += part; } }, stderr: { write: part => { received.err += part; } } };
  return { received, streams };
};
async function sandbox(runTest) {
  const dir = await mkdtemp(join(tmpdir(), 'p19-interaction-audit-'));
  try { await runTest(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const file = async (dir, data = sample(), name = 'snapshot.json') => {
  const path = join(dir, name);
  await writeFile(path, JSON.stringify(data));
  return path;
};
const invoke = async (argv, sink = output()) => ({ code: await run(argv, sink.streams), ...sink });

test('CLI argument parser requires a file to inspect', () => {
  assert.equal(args([]).ok, false);
  assert.equal(args(['--format', 'json']).ok, false);
});
test('CLI argument parser requires key-value pairs', () => {
  assert.equal(args(['--after']).ok, false);
  assert.equal(args(['--after', 'x', '--format']).ok, false);
});
test('CLI parser rejects an unsupported flag', () => {
  assert.equal(args(['--after', 'x', '--upload', 'yes']).ok, false);
});
test('CLI parser rejects duplicate flags', () => {
  assert.equal(args(['--after', 'a', '--after', 'b']).ok, false);
});
test('CLI parser rejects empty file paths', () => {
  assert.equal(args(['--after', '']).ok, false);
});
test('CLI parser rejects nonstring values', () => {
  assert.equal(args(['--after', 3]).ok, false);
});
test('CLI parser rejects non-array arguments', () => {
  assert.equal(args(null).ok, false);
});
test('CLI parser rejects unknown formats', () => {
  assert.equal(args(['--after', 'x', '--format', 'pdf']).ok, false);
});
test('CLI parser rejects unknown languages', () => {
  assert.equal(args(['--after', 'x', '--language', 'es']).ok, false);
});
test('CLI parser rejects invalid dates', () => {
  assert.equal(args(['--after', 'x', '--today', '2026-11-31']).ok, false);
});
test('CLI parser accepts every supported report format', () => {
  for (const format of ['html', 'text', 'json', 'csv']) assert.equal(args(['--after', 'x', '--format', format]).ok, true, format);
});
test('CLI parser accepts English and French explicitly', () => {
  for (const language of ['en', 'fr']) assert.equal(args(['--after', 'x', '--language', language]).ok, true);
});
test('CLI parser accepts optional baseline', () => {
  assert.equal(args(['--after', 'after', '--before', 'before']).ok, true);
});
test('CLI parser accepts explicit new output path', () => {
  assert.equal(args(['--after', 'after', '--output', 'result.html']).ok, true);
});
test('CLI parser uses an object without prototype pollution', () => {
  const parsed = args(['--after', 'x']);
  assert.equal(Object.getPrototypeOf(parsed.values), null);
});
test('CLI parser does not permit executable options', () => {
  assert.equal(args(['--after', 'x', '--run', 'shell']).ok, false);
});
test('CLI parser is deterministic for the same input', () => {
  const argv = ['--after', 'a', '--language', 'fr', '--format', 'csv'];
  assert.deepEqual(args(argv), args(argv));
});
test('safeRead opens an explicit regular JSON file', async () => sandbox(async dir => {
  const path = await file(dir);
  assert.deepEqual(JSON.parse(await safeRead(path)), sample());
}));
test('safeRead refuses directories', async () => sandbox(async dir => {
  await assert.rejects(safeRead(dir), /UNSAFE_INPUT/);
}));
test('safeRead refuses symlink input', async () => sandbox(async dir => {
  const source = await file(dir);
  const alias = join(dir, 'alias.json');
  await symlink(source, alias);
  await assert.rejects(safeRead(alias), /UNSAFE_INPUT/);
}));
test('safeRead refuses symlinked directory parents', async () => sandbox(async dir => {
  const source = await file(dir);
  const parent = join(dir, 'linked');
  await symlink(dir, parent);
  await assert.rejects(safeRead(join(parent, 'snapshot.json')), /UNSAFE_INPUT/);
  assert.ok(source);
}));
test('safeRead refuses an embedded zero byte in path', async () => {
  await assert.rejects(safeRead('bad\0name'), /UNSAFE_INPUT/);
});
test('safeRead refuses nonexistent input', async () => {
  await assert.rejects(safeRead('/not-a-real-p19-file'), /ENOENT/);
});
test('safeRead refuses an oversized file', async () => sandbox(async dir => {
  const path = join(dir, 'huge.json');
  await writeFile(path, 'x'.repeat(LIMITS.bytes + 1));
  await assert.rejects(safeRead(path), /UNSAFE_INPUT/);
}));
test('safeRead accepts a valid small file without modifying it', async () => sandbox(async dir => {
  const path = await file(dir);
  const previous = await stat(path);
  await safeRead(path);
  const next = await stat(path);
  assert.equal(previous.size, next.size);
}));
test('safeRead returns UTF-8 strings exactly', async () => sandbox(async dir => {
  const path = join(dir, 'fr.txt');
  await writeFile(path, 'État des contrôles', 'utf8');
  assert.equal(await safeRead(path), 'État des contrôles');
}));
test('safeWrite creates a new file exclusively', async () => sandbox(async dir => {
  const path = join(dir, 'report.txt');
  await safeWrite(path, 'UNKNOWN');
  assert.equal(await readFile(path, 'utf8'), 'UNKNOWN');
}));
test('safeWrite does not overwrite an existing output', async () => sandbox(async dir => {
  const path = join(dir, 'existing.txt');
  await writeFile(path, 'original');
  await assert.rejects(safeWrite(path, 'replacement'), { code: 'EEXIST' });
  assert.equal(await readFile(path, 'utf8'), 'original');
}));
test('safeWrite refuses embedded zero bytes in paths', async () => {
  await assert.rejects(safeWrite('bad\0name', 'text'), /UNSAFE_OUTPUT/);
});
test('safeWrite refuses nonstring content', async () => sandbox(async dir => {
  await assert.rejects(safeWrite(join(dir, 'report'), 5), /UNSAFE_OUTPUT/);
}));
test('safeWrite refuses symlinked output directory', async () => sandbox(async dir => {
  const alias = join(dir, 'alias');
  await symlink(dir, alias);
  await assert.rejects(safeWrite(join(alias, 'output.txt'), 'text'), /UNSAFE_OUTPUT/);
}));
test('safeWrite refuses missing parent directory', async () => sandbox(async dir => {
  await assert.rejects(safeWrite(join(dir, 'missing', 'out.txt'), 'text'), /ENOENT/);
}));
test('safeWrite does not create the parent directory implicitly', async () => sandbox(async dir => {
  const target = join(dir, 'absent', 'result.txt');
  await assert.rejects(safeWrite(target, 'x'));
  await assert.rejects(stat(join(dir, 'absent')), /ENOENT/);
}));
test('safeWrite applies owner-only file permissions', async () => sandbox(async dir => {
  const path = join(dir, 'private.txt');
  await safeWrite(path, 'private text');
  assert.equal((await stat(path)).mode & 0o777, 0o600);
}));
test('CLI without arguments returns a safe usage error', async () => {
  const result = await invoke([]);
  assert.equal(result.code, 2);
  assert.match(result.received.err, /ARGUMENTS/);
});
test('CLI with a valid inventory returns a report', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE]);
  assert.equal(result.code, 0);
  assert.match(result.received.out, /<!doctype html>/);
}));
test('CLI default HTML report includes provenance', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE]);
  assert.match(result.received.out, /CC0-1.0/);
}));
test('CLI outputs English JSON on request', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE, '--format', 'json']);
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.received.out).language, 'en');
}));
test('CLI outputs French JSON on request', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE, '--format', 'json', '--language', 'fr']);
  assert.equal(JSON.parse(result.received.out).language, 'fr');
}));
test('CLI outputs French HTML with language attribute', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE, '--language', 'fr']);
  assert.match(result.received.out, /<html lang="fr">/);
}));
test('CLI outputs French text with nonbreaking punctuation', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE, '--format', 'text', '--language', 'fr']);
  assert.match(result.received.out, /\u202f; /);
}));
test('CLI outputs CSV with UNKNOWN token', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE, '--format', 'csv']);
  assert.match(result.received.out, /"UNKNOWN"/);
}));
test('CLI can render a paired-language evidence file', async () => sandbox(async dir => {
  const path = await file(dir, paired());
  const result = await invoke(['--after', path, '--today', DATE, '--format', 'json']);
  assert.equal(JSON.parse(result.received.out).observations.length, 2);
}));
test('CLI can compare two local snapshots without network access', async () => sandbox(async dir => {
  const before = await file(dir, sample(), 'before.json');
  const after = await file(dir, paired(), 'after.json');
  const result = await invoke(['--before', before, '--after', after, '--today', DATE, '--format', 'json']);
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.received.out).comparison.counts.added, 1);
}));
test('CLI can write report to an explicitly named file', async () => sandbox(async dir => {
  const path = await file(dir);
  const outputPath = join(dir, 'report.html');
  const result = await invoke(['--after', path, '--today', DATE, '--output', outputPath]);
  assert.equal(result.code, 0);
  assert.match(await readFile(outputPath, 'utf8'), /<html lang="en">/);
}));
test('CLI does not print report when explicitly writing output', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE, '--output', join(dir, 'report.html')]);
  assert.equal(result.received.out, '');
}));
test('CLI refuses output overwrite without deleting existing content', async () => sandbox(async dir => {
  const path = await file(dir);
  const reportPath = join(dir, 'report.txt');
  await writeFile(reportPath, 'original');
  const result = await invoke(['--after', path, '--today', DATE, '--output', reportPath]);
  assert.equal(result.code, 2);
  assert.equal(await readFile(reportPath, 'utf8'), 'original');
}));
test('CLI reports invalid JSON without writing output', async () => sandbox(async dir => {
  const path = join(dir, 'bad.json');
  await writeFile(path, '{bad');
  const result = await invoke(['--after', path, '--today', DATE]);
  assert.equal(result.code, 2);
  assert.match(result.received.err, /INVALID_AFTER/);
  assert.equal(result.received.out, '');
}));
test('CLI rejects a future retrieval date without rendering', async () => sandbox(async dir => {
  const data = sample();
  data.routes[0].checks[0].retrievedOn = '2026-11-22';
  const path = await file(dir, data);
  const result = await invoke(['--after', path, '--today', DATE]);
  assert.equal(result.code, 2);
  assert.match(result.received.err, /RETRIEVED_ON/);
}));
test('CLI rejects invalid before snapshot instead of comparing', async () => sandbox(async dir => {
  const after = await file(dir);
  const before = join(dir, 'bad.json');
  await writeFile(before, '{}');
  const result = await invoke(['--after', after, '--before', before, '--today', DATE]);
  assert.equal(result.code, 2);
  assert.match(result.received.err, /INVALID_BEFORE/);
}));
test('CLI rejects a symlink input', async () => sandbox(async dir => {
  const path = await file(dir);
  const link = join(dir, 'link.json');
  await symlink(path, link);
  const result = await invoke(['--after', link, '--today', DATE]);
  assert.equal(result.code, 2);
  assert.match(result.received.err, /LOCAL_ERROR/);
}));
test('CLI does not disclose a private file path when parse fails', async () => sandbox(async dir => {
  const path = join(dir, 'sensitive-local.json');
  await writeFile(path, '{bad');
  const result = await invoke(['--after', path, '--today', DATE]);
  assert.doesNotMatch(result.received.err, /sensitive-local/);
}));
test('CLI never creates scheduled jobs or background monitors', async () => sandbox(async dir => {
  const path = await file(dir);
  await invoke(['--after', path, '--today', DATE]);
  assert.equal((await stat(path)).isFile(), true);
}));
test('CLI ignores external unknown flags rather than executing them', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--call-url', 'https://example.test']);
  assert.equal(result.code, 2);
}));
test('CLI returns two after a nonexistent file', async () => {
  const result = await invoke(['--after', '/nonexistent/p19.json', '--today', DATE]);
  assert.equal(result.code, 2);
  assert.match(result.received.err, /LOCAL_ERROR/);
});
test('CLI returns zero for an empty but valid inventory', async () => sandbox(async dir => {
  const path = await file(dir, { schemaVersion: 1, capturedOn: DATE, routes: [] });
  const result = await invoke(['--after', path, '--today', DATE, '--format', 'json']);
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.received.out).observations.length, 0);
}));
test('CLI writes only output explicitly requested by the user', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE]);
  assert.equal(result.code, 0);
  await assert.rejects(stat(join(dir, 'report.html')), /ENOENT/);
}));
test('CLI refuses a blank explicit report path', async () => {
  const result = await invoke(['--after', 'x', '--output', '']);
  assert.equal(result.code, 2);
});
test('CLI does not accept an invalid today reference', async () => {
  const result = await invoke(['--after', 'x', '--today', 'tomorrow']);
  assert.equal(result.code, 2);
});
test('CLI safely reports missing before input', async () => sandbox(async dir => {
  const path = await file(dir);
  const result = await invoke(['--after', path, '--before', join(dir, 'absent.json'), '--today', DATE]);
  assert.equal(result.code, 2);
  assert.equal(result.received.out, '');
}));
test('CLI does not modify input after rendering French report', async () => sandbox(async dir => {
  const path = await file(dir);
  const before = await readFile(path, 'utf8');
  await invoke(['--after', path, '--today', DATE, '--language', 'fr']);
  assert.equal(await readFile(path, 'utf8'), before);
}));
test('CLI supports explicit output into existing regular subdirectory', async () => sandbox(async dir => {
  const subdir = join(dir, 'exports');
  await mkdir(subdir);
  const path = await file(dir);
  const result = await invoke(['--after', path, '--today', DATE, '--output', join(subdir, 'report.html')]);
  assert.equal(result.code, 0);
}));

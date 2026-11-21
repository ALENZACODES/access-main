import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  FORMATS, readOptions, helpText, runCli, isDirectEntrypoint,
} from './offline-drill-cli.mjs';
import * as barrel from './offline-drill-index.mjs';
import { document } from './offline-drill-fixtures.mjs';

const run = async (args, io = {}) => {
  const output = [];
  const errors = [];
  const code = await runCli(args, {
    ...io, stdout: { write: (value) => output.push(value) },
    stderr: { write: (value) => errors.push(value) },
  });
  return { code, output: output.join(''), errors: errors.join('') };
};
const withLocalFile = async (fn) => {
  const dir = await mkdtemp(join(tmpdir(), 'offline-drill-'));
  const input = join(dir, 'input.json');
  await writeFile(input, JSON.stringify(document()), { flag: 'wx' });
  return fn({ dir, input, output: join(dir, 'output.html') });
};

test('manual CLI format vocabulary is stable and finite', () => {
  assert.deepEqual(FORMATS, ['text', 'csv', 'html', 'json']);
});
test('CLI help describes a manual local-only process', () => {
  const help = helpText();
  assert.ok(help.includes('--input'));
  assert.ok(help.includes('--format'));
  assert.ok(help.includes('never overwrites'));
  assert.ok(help.includes('UNKNOWN'));
});
test('help is accepted by itself', () => {
  assert.equal(readOptions(['--help']).ok, true);
  assert.equal(readOptions(['--help']).help, true);
  assert.equal(readOptions(['--help', '--input', 'x']).ok, false);
});
test('input argument is required', () => {
  assert.equal(readOptions([]).problem, 'ARGS_INPUT');
  assert.equal(readOptions(['--format', 'json']).problem, 'ARGS_INPUT');
});
test('unexpected arguments are rejected', () => {
  for (const args of [['--unknown', 'value'], ['--input', 'a', '--unknown', 'b'],
    ['--input', 'a', '--input', 'b'], ['--input']]) {
    assert.equal(readOptions(args).ok, false);
  }
});
test('default format and language are plain-text English', () => {
  const parsed = readOptions(['--input', 'local.json']);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.values.format, 'text');
  assert.equal(parsed.values.language, 'en');
  assert.equal(parsed.values.output, null);
});
test('valid explicit format, locale, date and destination are retained', () => {
  const parsed = readOptions(['--input', 'a', '--output', 'b',
    '--format', 'html', '--language', 'fr', '--today', '2026-11-19']);
  assert.deepEqual(parsed.values, {
    input: 'a', output: 'b', format: 'html', language: 'fr', today: '2026-11-19',
  });
});
test('unsupported export format fails before reading anything', () => {
  assert.equal(readOptions(['--input', 'a', '--format', 'pdf']).problem, 'ARGS_FORMAT');
});
test('unsupported locale cannot silently choose another translation', () => {
  assert.equal(readOptions(['--input', 'a', '--language', 'de']).problem, 'ARGS_LANGUAGE');
});
test('unparseable date argument fails without changing capture metadata', () => {
  assert.equal(readOptions(['--input', 'a', '--today', 'tomorrow']).problem, 'ARGS_DATE');
});
test('CLI refuses same input and output name', () => {
  assert.equal(readOptions(['--input', 'same', '--output', 'same']).problem, 'OUTPUT_EQUALS_INPUT');
});
test('CLI invalid arguments do not attempt any file operation', async () => {
  const io = { fs: { readFile: () => { throw Error('unexpected read'); },
    writeFile: () => { throw Error('unexpected write'); } } };
  const result = await run(['--bad'], io);
  assert.equal(result.code, 2);
  assert.ok(result.errors.includes('ARGS_INVALID'));
});
test('CLI help requires no local file', async () => {
  const result = await run(['--help']);
  assert.equal(result.code, 0);
  assert.ok(result.output.includes('Offline Degradation Drill'));
});
test('CLI reports missing source file without error stack or personal data', async () => {
  const result = await run(['--input', '/unavailable/drill.json']);
  assert.equal(result.code, 2);
  assert.ok(result.errors.includes('INPUT_READ_FAILED'));
  assert.ok(!result.errors.includes('Error:'));
});
test('CLI produces deterministic text report from a local input file', async () => {
  await withLocalFile(async ({ input }) => {
    const args = ['--input', input];
    const first = await run(args);
    const second = await run(args);
    assert.equal(first.code, 0);
    assert.equal(first.output, second.output);
    assert.ok(first.output.includes('UNKNOWN'));
  });
});
test('CLI produces French text using U+00A0 colons', async () => {
  await withLocalFile(async ({ input }) => {
    const result = await run(['--input', input, '--language', 'fr']);
    assert.equal(result.code, 0);
    assert.ok(result.output.includes('Total\u00A0:'));
    assert.ok(result.output.includes('UNKNOWN'));
  });
});
test('CLI produces parseable deterministic JSON', async () => {
  await withLocalFile(async ({ input }) => {
    const result = await run(['--input', input, '--format', 'json']);
    assert.equal(result.code, 0);
    const parsed = JSON.parse(result.output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.model.summary.total, 1);
  });
});
test('CLI produces a CSV with spreadsheet safety and source fields', async () => {
  await withLocalFile(async ({ input }) => {
    const result = await run(['--input', input, '--format', 'csv']);
    assert.equal(result.code, 0);
    assert.ok(result.output.startsWith('\uFEFF'));
    assert.ok(result.output.includes('"CC0-1.0"'));
  });
});
test('CLI produces accessible standalone HTML', async () => {
  await withLocalFile(async ({ input }) => {
    const result = await run(['--input', input, '--format', 'html']);
    assert.equal(result.code, 0);
    assert.ok(result.output.includes('<html lang="en">'));
    assert.ok(result.output.includes('<th scope="col">'));
  });
});
test('CLI writes a new output file only with restrictive permissions', async () => {
  await withLocalFile(async ({ input, output }) => {
    const result = await run(['--input', input, '--output', output, '--format', 'html']);
    assert.equal(result.code, 0);
    assert.equal(result.output, '');
    assert.ok((await readFile(output, 'utf8')).includes('<main>'));
  });
});
test('CLI never overwrites an existing report', async () => {
  await withLocalFile(async ({ input, output }) => {
    await writeFile(output, 'preserve this report', { flag: 'wx' });
    const result = await run(['--input', input, '--output', output]);
    assert.equal(result.code, 2);
    assert.ok(result.errors.includes('OUTPUT_WRITE_FAILED'));
    assert.equal(await readFile(output, 'utf8'), 'preserve this report');
  });
});
test('CLI rejects JSON with no provenance and never writes output', async () => {
  await withLocalFile(async ({ input, output }) => {
    const invalid = document();
    invalid.sources[0].provenance.source = null;
    await writeFile(input, JSON.stringify(invalid));
    const result = await run(['--input', input, '--output', output]);
    assert.equal(result.code, 2);
    assert.ok(result.errors.includes('SOURCE_URL'));
    await assert.rejects(readFile(output));
  });
});
test('CLI rejects malformed JSON with a bounded error', async () => {
  await withLocalFile(async ({ input }) => {
    await writeFile(input, '{bad-json');
    const result = await run(['--input', input]);
    assert.equal(result.code, 2);
    assert.ok(result.errors.includes('INPUT_JSON'));
  });
});
test('CLI returns bounded failure for oversized local input', async () => {
  const result = await run(['--input', 'example'], { fs: {
    readFile: async () => 'x'.repeat(8_000_001), writeFile: async () => {},
  } });
  assert.equal(result.code, 2);
  assert.ok(result.errors.includes('INPUT_LIMIT'));
});
test('CLI import URL recognition accepts exact direct execution', () => {
  assert.equal(isDirectEntrypoint(pathToFileURL('/tmp/run.mjs').href, '/tmp/run.mjs'), true);
  assert.equal(isDirectEntrypoint(pathToFileURL('/tmp/run.mjs').href, '/tmp/other.mjs'), false);
});
test('CLI module can execute as standalone entrypoint', async () => {
  await withLocalFile(async ({ input }) => {
    const result = spawnSync(process.execPath,
      [new URL('./offline-drill-cli.mjs', import.meta.url).pathname,
        '--input', input, '--format', 'json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
  });
});
test('barrel exports all programmatic API entrypoints', () => {
  for (const name of ['inspectDrill', 'evaluateDrill', 'gateMatrix',
    'scenarioCoverage', 'reviewPlan', 'textReport', 'htmlReport',
    'csvReport', 'runCli', 'readOptions', 'parseDrill', 'serializeDrill']) {
    assert.equal(typeof barrel[name], 'function', name);
  }
});
test('barrel exposes deterministic finite vocabularies', () => {
  assert.equal(barrel.DRILL_VERSION, 1);
  assert.ok(barrel.GATE_RULES.includes('TARGET_SIZE'));
  assert.equal(barrel.DRILL_LIMITS.maxBytes, 8_000_000);
});

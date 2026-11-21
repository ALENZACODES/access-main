import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs, safeRead, safeWrite, run } from './review-ledger-cli.mjs';
import { TODAY, fixture, openCase, withConflict } from './review-ledger-fixtures.mjs';
function streams() {
  const messages = { out: '', err: '' };
  return { messages, io: {
    stdout: { write(value) { messages.out += value; } },
    stderr: { write(value) { messages.err += value; } }
  } };
}
async function withDirectory(fn) {
  const root = await mkdtemp(join(tmpdir(), 'p19-review-'));
  try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function writeLedger(root, name, data = fixture()) {
  const path = join(root, name);
  await writeFile(path, JSON.stringify(data));
  return path;
}

test('CLI rejects missing arguments with clear message', () => {
  const parsed = parseArgs([]);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'ARGUMENTS');
});
test('CLI refuses missing --after value', () => {
  assert.equal(parseArgs(['--format', 'json']).ok, false);
  assert.equal(parseArgs(['--after']).ok, false);
});
test('CLI refuses duplicate arguments', () => {
  const parsed = parseArgs(['--after', 'a', '--after', 'b']);
  assert.equal(parsed.ok, false);
});
test('CLI refuses unsupported argument names', () => {
  const parsed = parseArgs(['--after', 'a', '--upload', 'https://invalid.example']);
  assert.equal(parsed.ok, false);
});
test('CLI refuses unsupported formats', () => {
  assert.equal(parseArgs(['--after', 'a', '--format', 'pdf']).ok, false);
});
test('CLI refuses unsupported languages', () => {
  assert.equal(parseArgs(['--after', 'a', '--language', 'xx']).ok, false);
});
test('CLI refuses unsupported modes', () => {
  assert.equal(parseArgs(['--after', 'a', '--mode', 'publish']).ok, false);
});
test('comparison mode requires an explicitly supplied before file', () => {
  assert.equal(parseArgs(['--after', 'a', '--mode', 'compare']).ok, false);
  assert.equal(parseArgs(['--after', 'a', '--before', 'b', '--mode', 'compare']).ok, true);
});
test('CLI refuses invalid reporting dates', () => {
  assert.equal(parseArgs(['--after', 'a', '--today', 'tomorrow']).ok, false);
});
test('CLI accepts valid offline review options', () => {
  const parsed = parseArgs(['--after', 'a', '--format', 'csv', '--language', 'fr', '--today', TODAY]);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.args['--language'], 'fr');
});
test('safeRead reads a normal local file', () => withDirectory(async root => {
  const input = await writeLedger(root, 'input.json');
  const content = await safeRead(input);
  assert.equal(JSON.parse(content).schemaVersion, 1);
}));
test('safeRead refuses symlinked input', () => withDirectory(async root => {
  const original = await writeLedger(root, 'input.json');
  const link = join(root, 'link.json');
  await symlink(original, link);
  await assert.rejects(safeRead(link), /UNSAFE_INPUT/);
}));
test('safeRead refuses directories', () => withDirectory(async root => {
  await assert.rejects(safeRead(root), /UNSAFE_INPUT/);
}));
test('safeRead refuses NUL-containing paths', async () => {
  await assert.rejects(safeRead('a\0b'), /UNSAFE_INPUT/);
});
test('safeRead refuses missing file', () => withDirectory(async root => {
  await assert.rejects(safeRead(join(root, 'missing.json')));
}));
test('safeWrite creates local file with exact contents', () => withDirectory(async root => {
  const out = join(root, 'report.txt');
  await safeWrite(out, 'manual review only');
  assert.equal(await readFile(out, 'utf8'), 'manual review only');
}));
test('safeWrite cannot replace an existing file', () => withDirectory(async root => {
  const out = join(root, 'report.txt');
  await writeFile(out, 'original');
  await assert.rejects(safeWrite(out, 'replacement'), { code: 'EEXIST' });
  assert.equal(await readFile(out, 'utf8'), 'original');
}));
test('safeWrite refuses symlinked parent directory', () => withDirectory(async root => {
  const source = join(root, 'real');
  const alias = join(root, 'alias');
  await mkdir(source);
  await symlink(source, alias);
  await assert.rejects(safeWrite(join(alias, 'report.txt'), 'hello'), /UNSAFE_OUTPUT/);
}));
test('safeWrite refuses NUL-containing path', async () => {
  await assert.rejects(safeWrite('a\0b', 'text'), /UNSAFE_OUTPUT/);
});
test('safeWrite refuses non-text content', () => withDirectory(async root => {
  await assert.rejects(safeWrite(join(root, 'test'), 2), /UNSAFE_OUTPUT/);
}));
test('CLI prints an English HTML report to stdout by default', () => withDirectory(async root => {
  const input = await writeLedger(root, 'after.json');
  const { io, messages } = streams();
  const code = await run(['--after', input, '--today', TODAY], io);
  assert.equal(code, 0);
  assert.match(messages.out, /<html lang="en">/);
  assert.equal(messages.err, '');
}));
test('CLI prints French text with typographic spaces', () => withDirectory(async root => {
  const input = await writeLedger(root, 'after.json');
  const { io, messages } = streams();
  const code = await run(['--after', input, '--today', TODAY, '--format', 'text', '--language', 'fr'], io);
  assert.equal(code, 0);
  assert.match(messages.out, /\u202f; /u);
  assert.match(messages.out, /UNKNOWN/);
}));
test('CLI writes a new accessible HTML file', () => withDirectory(async root => {
  const input = await writeLedger(root, 'after.json');
  const output = join(root, 'report.html');
  const { io } = streams();
  const code = await run(['--after', input, '--today', TODAY, '--output', output], io);
  assert.equal(code, 0);
  assert.match(await readFile(output, 'utf8'), /focus-visible/);
}));
test('CLI refuses to overwrite existing report', () => withDirectory(async root => {
  const input = await writeLedger(root, 'after.json');
  const output = join(root, 'report.html');
  await writeFile(output, 'do not overwrite');
  const { io, messages } = streams();
  const code = await run(['--after', input, '--today', TODAY, '--output', output], io);
  assert.equal(code, 2);
  assert.match(messages.err, /IO_ERROR/);
  assert.equal(await readFile(output, 'utf8'), 'do not overwrite');
}));
test('CLI prints queue mode without user data', () => withDirectory(async root => {
  const input = await writeLedger(root, 'after.json');
  const { io, messages } = streams();
  const code = await run(['--after', input, '--today', TODAY, '--mode', 'queue'], io);
  assert.equal(code, 0);
  const result = JSON.parse(messages.out);
  assert.equal(result.rows[0].status, 'UNKNOWN');
}));
test('CLI prints comparison between two local documents', () => withDirectory(async root => {
  const before = await writeLedger(root, 'before.json');
  const after = await writeLedger(root, 'after.json', openCase());
  const { io, messages } = streams();
  const code = await run(['--after', after, '--before', before, '--mode', 'compare', '--today', TODAY], io);
  assert.equal(code, 0);
  assert.equal(JSON.parse(messages.out).events.counts.added, 1);
}));
test('CLI rejects malformed JSON without writing output', () => withDirectory(async root => {
  const input = join(root, 'invalid.json');
  await writeFile(input, '{not-json');
  const output = join(root, 'should-not-exist.html');
  const { io, messages } = streams();
  const code = await run(['--after', input, '--output', output, '--today', TODAY], io);
  assert.equal(code, 2);
  assert.match(messages.err, /INVALID_AFTER/);
  await assert.rejects(readFile(output, 'utf8'));
}));
test('CLI rejects invalid before document', () => withDirectory(async root => {
  const after = await writeLedger(root, 'after.json');
  const before = await writeLedger(root, 'before.json', { ...fixture(), schemaVersion: 2 });
  const { io, messages } = streams();
  const code = await run(['--after', after, '--before', before, '--today', TODAY], io);
  assert.equal(code, 2);
  assert.match(messages.err, /INVALID_BEFORE/);
}));
test('CLI reports malformed arguments with error exit status', async () => {
  const { io, messages } = streams();
  const code = await run(['--format', 'pdf'], io);
  assert.equal(code, 2);
  assert.match(messages.err, /ARGUMENTS/);
});
test('CLI reports contradictory records without producing accessibility conclusions', () => withDirectory(async root => {
  const input = await writeLedger(root, 'conflict.json', withConflict());
  const { io, messages } = streams();
  const code = await run(['--after', input, '--today', TODAY, '--format', 'json'], io);
  assert.equal(code, 0);
  const report = JSON.parse(messages.out);
  assert.ok(report.findings.some(x => x.code === 'CONFLICT'));
  assert.equal(report.cases[0].status, 'UNKNOWN');
}));
test('CLI exports CSV without formula interpretation', () => withDirectory(async root => {
  const input = await writeLedger(root, 'after.json');
  const { io, messages } = streams();
  const code = await run(['--after', input, '--today', TODAY, '--format', 'csv'], io);
  assert.equal(code, 0);
  assert.match(messages.out, /"UNKNOWN"/);
  assert.match(messages.out, /"CC0-1.0"/);
}));

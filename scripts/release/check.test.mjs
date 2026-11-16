import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inspectRelease, parseArgs, DEFAULT_BUDGET_BYTES } from './check.mjs';

async function withRelease(entries, run) {
  const root = await mkdtemp(join(tmpdir(), 'release-check-'));
  try {
    for (const [name, value] of Object.entries(entries)) {
      const file = join(root, name);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, value);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('clean bilingual release passes and counts nested bytes', async () => {
  await withRelease({ 'index.html': 'Welcome / Bienvenue', 'assets/app.js': 'const x = "UNKNOWN";' }, async (dir) => {
    const result = await inspectRelease(dir);
    assert.equal(result.files, 2);
    assert.equal(result.totalBytes, Buffer.byteLength('Welcome / Bienvenue') + Buffer.byteLength('const x = "UNKNOWN";'));
    assert.deepEqual(result.issues, []);
    assert.equal(result.budgetBytes, DEFAULT_BUDGET_BYTES);
  });
});

test('rejects a size over the configured budget', async () => {
  await withRelease({ 'index.html': '12345' }, async (dir) => {
    assert.match((await inspectRelease(dir, { budgetBytes: 4 })).issues.join(' '), /Size 5 exceeds 4/);
  });
});

test('detects replacement character and forbidden branding without normalising unknown', async () => {
  await withRelease({ 'index.html': '\uFFFD ' + ['sci', 'ontario'].join('') + ' UNKNOWN' }, async (dir) => {
    const issues = (await inspectRelease(dir)).issues;
    assert.ok(issues.some((issue) => issue.includes('U+FFFD')));
    assert.ok(issues.some((issue) => issue.includes('prohibited release text')));
  });
});

test('rejects malformed UTF-8 instead of silently replacing bytes', async () => {
  await withRelease({ 'bad.json': Buffer.from([0xc3, 0x28]) }, async (dir) => {
    assert.match((await inspectRelease(dir)).issues.join(' '), /invalid UTF-8/);
  });
});

test('rejects an empty release directory and invalid arguments', async () => {
  await withRelease({}, async (dir) => {
    await assert.rejects(inspectRelease(dir), /empty/);
  });
  assert.throws(() => parseArgs(['--budget', '-1', '--dir', 'dist']), /Invalid budget/);
  assert.throws(() => parseArgs([]), /--dir requis/);
});

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inspectRelease, parseArgs, DEFAULT_BUDGET_BYTES } from './check.mjs';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';

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

test('detects a replacement character while leaving UNKNOWN untouched', async () => {
  await withRelease({ 'index.html': '\uFFFD UNKNOWN' }, async (dir) => {
    const issues = (await inspectRelease(dir)).issues;
    assert.ok(issues.some((issue) => issue.includes('U+FFFD')));
    assert.equal(issues.filter((issue) => issue.includes('prohibited release text')).length, 0);
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


test('rejects all French confirmation-word stems in shipped text', async () => {
  for (const word of ['Vérification', 'vérifier', 'vérifié', 'vérifiez', 'verif']) {
    await withRelease({ 'index.html': `<p>${word}</p>` }, async (dir) => {
      const report = await inspectRelease(dir);
      assert.ok(report.issues.some((issue) => issue.includes('prohibited release text')), word);
    });
  }
});

for (const [index, needle] of forbiddenOrgNeedles().entries()) {
  test(`rejects shared forbidden organisation needle ${index}`, async () => {
    await withRelease({ 'index.html': `prefix ${needle} suffix` }, async (dir) => {
      const result = await inspectRelease(dir);
      assert.ok(result.issues.some((issue) => issue.includes('prohibited release text')));
    });
  });
}

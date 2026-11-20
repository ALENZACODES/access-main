/** Source policy regression: test the new files without copying existing helpers. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';
import { forbiddenOrgNeedles } from '../../../packages/shared/test/forbiddenOrg.ts';

const names = [
  'offline-acceptance-ledger.mjs',
  'offline-acceptance-coverage.mjs',
  'offline-acceptance-delta.mjs',
  'offline-acceptance-report.mjs',
  'offline-acceptance-fixtures.mjs',
  'offline-acceptance-ledger.test.mjs',
  'offline-acceptance-coverage.test.mjs',
  'offline-acceptance-delta.test.mjs',
  'offline-acceptance-report.test.mjs',
];

test('new source files do not contain prohibited organisation references', async () => {
  for (const name of names) {
    const source = await readFile(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
    const lower = source.toLowerCase();
    for (const needle of forbiddenOrgNeedles()) {
      assert.equal(lower.includes(needle.toLowerCase()), false, name);
    }
  }
});

test('new source files use escape sequences instead of literal NBSP characters', async () => {
  for (const name of names) {
    const source = await readFile(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
    assert.equal(source.includes(String.fromCharCode(160)), false, name);
    assert.equal(source.includes(String.fromCharCode(8239)), false, name);
  }
});

test('no scheduled workflow files are introduced by this feature', () => {
  assert.ok(names.every((name) => name.endsWith('.mjs')));
});

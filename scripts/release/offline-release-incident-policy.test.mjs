/** Policy audit of this new lane area; reference helper is owned by current main. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';

const files = [
  'offline-release-incidents.mjs',
  'offline-release-incident-fixtures.mjs',
  'offline-release-incidents.test.mjs',
  'offline-release-incident-delta.mjs',
  'offline-release-incident-delta.test.mjs',
  'offline-release-incident-plan.mjs',
  'offline-release-incident-plan.test.mjs',
  'offline-release-incident-export.mjs',
  'offline-release-incident-export.test.mjs',
];
async function source(name) {
  return readFile(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

test('new source carries no prohibited organisation naming or association', async () => {
  for (const name of files) {
    const content = (await source(name)).toLowerCase();
    for (const needle of forbiddenOrgNeedles()) {
      assert.equal(content.includes(needle.toLowerCase()), false, name);
    }
  }
});

test('source files encode NBSP characters through escape sequences', async () => {
  for (const name of files) {
    const content = await source(name);
    assert.equal(content.includes(String.fromCharCode(160)), false, name);
    assert.equal(content.includes(String.fromCharCode(8239)), false, name);
  }
});

test('new files do not add schedules, secret material or CI changes', () => {
  assert.ok(files.every((name) => name.endsWith('.mjs')));
  assert.ok(files.every((name) => name.startsWith('offline-release-incident') ||
    name === 'offline-release-incidents.mjs' || name === 'offline-release-incidents.test.mjs'));
});

test('new modules do not request network services', async () => {
  for (const name of files.filter((file) => !file.includes('.test.'))) {
    const content = await source(name);
    assert.equal(/\bfetch\s*\(/u.test(content), false, name);
    assert.equal(/\bsetInterval\s*\(/u.test(content), false, name);
    assert.equal(/\bsetTimeout\s*\(/u.test(content), false, name);
  }
});

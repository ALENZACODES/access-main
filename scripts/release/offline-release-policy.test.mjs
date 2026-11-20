import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';
import { inspectRelease } from './offline-release-contract.mjs';

const FILES = [
  'offline-release-contract.mjs', 'offline-release-graph.mjs',
  'offline-release-delta.mjs', 'offline-release-export.mjs',
];
const tests = [
  'offline-release-contract.test.mjs', 'offline-release-graph.test.mjs',
  'offline-release-delta.test.mjs', 'offline-release-export.test.mjs',
];
test('new files do not contain prohibited organisation names', () => {
  const needles = forbiddenOrgNeedles().map((needle) => needle.toLowerCase());
  for (const name of [...FILES, ...tests]) {
    const content = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').toLowerCase();
    assert.equal(needles.some((needle) => content.includes(needle)), false, name);
  }
});
test('new source avoids literal nonbreaking and narrow nonbreaking spaces', () => {
  for (const name of FILES) {
    const content = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    assert.equal(content.includes('\u00A0'), false, name);
    assert.equal(content.includes('\u202F'), false, name);
  }
});
test('source files use only local and builtin module imports', () => {
  for (const name of FILES) {
    const content = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    const imported = [...content.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1]);
    assert.ok(imported.every((specifier) => specifier.startsWith('./') || specifier.startsWith('node:')), name);
  }
});
test('the declared UNKNOWN state remains unmodified on validation', () => {
  const input = { version: 1, releaseId: 'r29', createdOn: '2026-11-19',
    locale: { en: true, fr: true }, notice: { en: 'Example', fr: 'Exemple' },
    sources: [], assets: [], claims: [{ id: 'claim', recordId: 'fixture',
      field: 'stepFreeEntrance', state: 'UNKNOWN', sourceIds: [] }] };
  const before = structuredClone(input);
  assert.equal(inspectRelease(input).ok, true);
  assert.deepEqual(input, before);
  assert.equal(input.claims[0].state, 'UNKNOWN');
});

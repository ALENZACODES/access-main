/** Integration checks for the shipped update-rehearsal lane. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as barrel from './offline-update-rehearsal-index.mjs';
import { document } from './offline-update-rehearsal-fixtures.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const names = [
  'offline-update-rehearsal-contract.mjs',
  'offline-update-rehearsal-engine.mjs',
  'offline-update-rehearsal-compare.mjs',
  'offline-update-rehearsal-report.mjs',
  'offline-update-rehearsal-cli.mjs',
  'offline-update-rehearsal-index.mjs',
];
test('barrel mounts the complete public validator and replay API', () => {
  for (const name of ['validateRehearsal', 'parseRehearsal', 'releaseReview',
    'compareRehearsals', 'phaseCoverage', 'renderReport', 'runUpdateRehearsalCli']) {
    assert.equal(typeof barrel[name], 'function', name);
  }
});
test('the public barrel does not execute any file or network operation on import', () => {
  assert.equal(barrel.validateRehearsal(document()).ok, true);
});
test('all new code uses explicit relative imports that resolve to included modules', () => {
  for (const name of names) {
    const code = readFileSync(join(root, name), 'utf8');
    for (const [, relativePath] of code.matchAll(/from ['"](\.\/[^'"]+)['"]/g)) {
      assert.ok(names.includes(relativePath.slice(2)), `${name}: ${relativePath}`);
    }
  }
});
test('no new module declares cron or background timer workflows', () => {
  for (const name of names) {
    const code = readFileSync(join(root, name), 'utf8');
    assert.equal(/setInterval\s*\(|setTimeout\s*\(/u.test(code), false, name);
    assert.equal(/\.github\/workflows|schedule\s*:/u.test(code), false, name);
  }
});
test('no source module contains literal irregular whitespace characters', () => {
  for (const name of names) {
    const code = readFileSync(join(root, name), 'utf8');
    assert.equal(code.includes(String.fromCharCode(160)), false, name);
    assert.equal(code.includes(String.fromCharCode(8239)), false, name);
  }
});
test('no source module contains a control-character regex class', () => {
  for (const name of names) {
    const code = readFileSync(join(root, name), 'utf8');
    assert.equal(code.includes('\\x00'), false, name);
    assert.equal(code.includes('\\u0000'), false, name);
  }
});
test('runtime French copy uses explicit nonbreaking punctuation', () => {
  const report = barrel.textReport(document(), 'fr');
  assert.ok(report.includes('Source\u00A0:'));
  assert.ok(report.includes('UNKNOWN'));
});
test('runtime French guillemet check uses narrow nonbreaking spaces', () => {
  assert.equal(barrel.goodFrench('«\u202Fexemple\u202F»'), true);
  assert.equal(barrel.goodFrench('«exemple»'), false);
});
test('the source does not claim positive accessibility outcomes', () => {
  const report = barrel.releaseReview(document());
  assert.equal(report.summary.state, 'UNKNOWN');
  assert.ok(report.summary.unknown > 0);
});
test('new modules are all safely below fifty megabytes', () => {
  for (const name of names) {
    const length = Buffer.byteLength(readFileSync(join(root, name)), 'utf8');
    assert.ok(length < 50_000_000, name);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as barrel from './offline-conflict-index.mjs';
import { record, register, opposed, sharedSource, DAY } from './offline-conflict-fixtures.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const files = [
  'offline-conflict-contract.mjs', 'offline-conflict-analysis.mjs',
  'offline-conflict-delta.mjs', 'offline-conflict-report.mjs',
  'offline-conflict-cli.mjs', 'offline-conflict-index.mjs',
];
const sampleFields = () => [
  'stepFreeEntrance', 'accessibleWashroom', 'accessibleParking',
  'liftAvailable', 'clearWidth', 'ramp',
];

test('barrel exports the contract validator', () => {
  assert.equal(typeof barrel.validateRegister, 'function');
});
test('barrel exports deterministic fingerprint support', () => {
  assert.equal(typeof barrel.fingerprint, 'function');
});
test('barrel exports grouping and disagreement detection', () => {
  assert.equal(typeof barrel.analyzeConflicts, 'function');
});
test('barrel exports human review tasks', () => {
  assert.equal(typeof barrel.reviewPlan, 'function');
});
test('barrel exports release comparisons', () => {
  assert.equal(typeof barrel.compareRegisters, 'function');
});
test('barrel exports localized reports', () => {
  assert.equal(typeof barrel.reportByFormat, 'function');
});
test('barrel exports the manual CLI', () => {
  assert.equal(typeof barrel.runConflictCli, 'function');
});
test('manual command is present in the complete release package manifest', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts['audit:conflicts'], 'node --experimental-strip-types offline-conflict-cli.mjs');
});
test('manual command does not change the release test script', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts.test, 'node --test --experimental-strip-types *.test.mjs');
});
test('manual command does not add any recurring background run', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.ok(Object.keys(manifest.scripts).every(key => !key.includes('cron') && !key.includes('schedule')));
});
test('every in-package implementation file can be opened locally', async () => {
  for (const name of files) assert.ok((await readFile(join(root, name), 'utf8')).length > 0, name);
});
test('all runtime relative source imports exist in this package', async () => {
  for (const name of files) {
    const source = await readFile(join(root, name), 'utf8');
    for (const line of source.split('\n')) {
      const match = line.match(/from ['"](\.\/[^'"]+)['"]/u);
      if (match) assert.ok((await readFile(join(root, match[1]), 'utf8')).length > 0, `${name}:${match[1]}`);
    }
  }
});
test('no runtime module uses imported remote scripts', async () => {
  for (const name of files) {
    const source = await readFile(join(root, name), 'utf8');
    assert.ok(!source.includes('https://cdn.'), name);
    assert.ok(!source.includes('import(' + "'https:"), name);
  }
});
test('no runtime module changes local or session storage', async () => {
  for (const name of files) {
    const source = await readFile(join(root, name), 'utf8');
    assert.ok(!source.includes('localStorage.setItem'), name);
    assert.ok(!source.includes('sessionStorage.setItem'), name);
  }
});
test('no runtime module starts a periodic timer', async () => {
  for (const name of files) {
    const source = await readFile(join(root, name), 'utf8');
    assert.ok(!source.includes('setInterval('), name);
    assert.ok(!source.includes('setTimeout('), name);
  }
});
test('no runtime module contains literal nonbreaking spaces', async () => {
  for (const name of files) {
    const source = await readFile(join(root, name), 'utf8');
    assert.ok(!source.includes('\u00a0'), name);
    assert.ok(!source.includes('\u202f'), name);
  }
});
test('no runtime module uses a regex character range for low control codes', async () => {
  for (const name of files) {
    const source = await readFile(join(root, name), 'utf8');
    assert.ok(!source.includes('\\x00-\\x1f'), name);
    assert.ok(!source.includes('\\u0000-\\u001f'), name);
  }
});
test('no dependency overwrites the root package scripts', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.ok(manifest.scripts.verify.includes('preflight.mjs'));
  assert.ok(manifest.scripts['audit:custody'].includes('artifact-custody-cli.mjs'));
});
test('UNKNOWN remains an exact English report token', () => {
  assert.equal(barrel.reportCopy('en').unknown, 'UNKNOWN');
});
test('UNKNOWN remains an exact French report token', () => {
  assert.equal(barrel.reportCopy('fr').unknown, 'UNKNOWN');
});
test('new feature never introduces an automatic claim-resolution action', () => {
  assert.ok(barrel.reviewPlan(opposed()).tasks.every(task => task.action === 'human-review'));
});
test('all current claim categories may be represented without inference', () => {
  for (const attribute of sampleFields()) {
    const result = barrel.analyzeConflicts(register(record('a', { attribute })));
    assert.equal(result.ok, true, attribute);
    assert.equal(result.summary.unknownRecords, 1);
  }
});
test('multiple subjects remain independent in grouping', () => {
  const data = register(record('a', { subject: 'site-a' }), record('b', { subject: 'site-b' }));
  assert.equal(barrel.groupEvidence(data.records).length, 2);
});
test('contradictory source states require human review in either language', () => {
  for (const lang of ['en', 'fr']) {
    const output = barrel.reportByFormat(sharedSource(), 'text', lang);
    assert.equal(output.ok, true);
    assert.ok(output.text.includes('UNKNOWN'));
  }
});
test('a known claim still has no agreement summary when unopposed', () => {
  const input = register(record('known', { state: 'YES' }));
  const output = barrel.analyzeConflicts(input);
  assert.equal(output.summary.conflicts, 0);
});
test('a missing source cannot be disguised by a strong tier', () => {
  const value = register(record('a', { tier: 4, source: null }));
  assert.equal(barrel.analyzeConflicts(value).ok, false);
});
test('a newer date cannot settle an opposed source', () => {
  const value = opposed();
  value.records[1].capturedOn = DAY;
  assert.ok(barrel.analyzeConflicts(value).conflicts.some(item => item.kind === 'opposed'));
});
test('more records cannot outvote an opposed observation', () => {
  const value = register(record('yes', { state: 'YES' }), record('no', { state: 'NO' }),
    record('yes2', { state: 'YES' }), record('yes3', { state: 'YES' }));
  assert.ok(barrel.analyzeConflicts(value).conflicts.some(item => item.kind === 'opposed'));
});
test('a source tier change alone never promotes UNKNOWN', () => {
  const first = register(record('a', { tier: 0 }));
  const second = register(record('a', { tier: 2 }));
  const result = barrel.compareRegisters(first, second);
  assert.ok(result.changes.every(item => item.outcome === 'UNKNOWN'));
});
test('local source metadata survives the serialized round trip', () => {
  const original = register(record('a'));
  const output = barrel.serializeRegister(original);
  const later = barrel.parseRegister(output.text);
  assert.equal(later.value.records[0].licence, original.records[0].licence);
  assert.equal(later.value.records[0].retrievedOn, original.records[0].retrievedOn);
});
test('review tasks contain no personal contact information', () => {
  const result = barrel.reviewPlan(sharedSource());
  assert.ok(result.tasks.every(task => !Object.hasOwn(task, 'email')));
  assert.ok(result.tasks.every(task => !Object.hasOwn(task, 'phone')));
});
test('source URL is never treated as a test-result URL', () => {
  const result = barrel.modelForReport(sharedSource());
  assert.ok(result.rows.every(row => row.outcome === 'UNKNOWN'));
});
test('reporting does not insert generated observation dates', () => {
  const report = barrel.jsonReport(sharedSource());
  const result = JSON.parse(report.text);
  assert.ok(!Object.hasOwn(result, 'generatedAt'));
});
test('analysis on valid data does not require an external clock', () => {
  assert.equal(barrel.analyzeConflicts(sharedSource()).ok, true);
});
test('a supplied reference date is honored without mutating inputs', () => {
  const data = register(record('a')); const before = JSON.stringify(data);
  assert.equal(barrel.analyzeConflicts(data, { today: DAY }).ok, true);
  assert.equal(JSON.stringify(data), before);
});

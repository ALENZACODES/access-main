import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';
import { parseCliArguments } from './interaction-regression-cli.mjs';
import { REPORT_COLUMNS, reportWords } from './interaction-regression-report.mjs';
import { OUTCOMES, CHECK_CATEGORIES } from './interaction-regression-contract.mjs';
import * as api from './interaction-regression-index.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const files = [
  'interaction-regression-contract.mjs', 'interaction-regression-compare.mjs',
  'interaction-regression-coverage.mjs', 'interaction-regression-report.mjs',
  'interaction-regression-cli.mjs', 'interaction-regression-index.mjs',
  'interaction-regression-fixtures.mjs',
];

test('all new feature files contain no forbidden organisation names', () => {
  const needles = forbiddenOrgNeedles();
  for (const name of files) {
    const source = readFileSync(join(root, name), 'utf8').toLowerCase();
    for (const needle of needles) assert.equal(source.includes(needle.toLowerCase()), false, name);
  }
});
test('no source file contains literal irregular French spacing characters', () => {
  for (const name of files) {
    const source = readFileSync(join(root, name), 'utf8');
    assert.equal(source.includes(String.fromCodePoint(0xa0)), false, name);
    assert.equal(source.includes(String.fromCodePoint(0x202f)), false, name);
  }
});
test('no feature writes to the network or schedules recurring tasks', () => {
  for (const name of files) {
    const source = readFileSync(join(root, name), 'utf8');
    assert.ok(!/\bsetInterval\s*\(/u.test(source), name);
    assert.ok(!/\bfetch\s*\(/u.test(source), name);
    assert.ok(!/\bXMLHttpRequest\b/u.test(source), name);
  }
});
test('Node built-ins are imported where needed', () => {
  const cli = readFileSync(join(root, 'interaction-regression-cli.mjs'), 'utf8');
  const contract = readFileSync(join(root, 'interaction-regression-contract.mjs'), 'utf8');
  assert.ok(cli.includes("from 'node:buffer'"));
  assert.ok(contract.includes("from 'node:buffer'"));
  assert.ok(contract.includes("from 'node:url'"));
});
test('the exported interface includes all required stages', () => {
  for (const key of ['inspectRegressionSnapshot', 'compareRegressionSnapshots',
    'analyzeCoverage', 'reportByFormat', 'runRegressionCli',
    'parseCliArguments']) assert.equal(typeof api[key], 'function', key);
});
test('the public API retains the explicit UNKNOWN token', () => {
  assert.deepEqual(OUTCOMES, ['PASS', 'FAIL', 'UNKNOWN']);
  assert.ok(CHECK_CATEGORIES.includes('screen-reader'));
  assert.equal(reportWords('fr').unknown, 'UNKNOWN');
});
test('all 16 CSV columns have localized labels', () => {
  assert.equal(REPORT_COLUMNS.length, 16);
  for (const key of REPORT_COLUMNS) {
    assert.ok(reportWords('en')[key]?.trim());
    assert.ok(reportWords('fr')[key]?.trim());
  }
});
test('CLI arguments do not expose any scheduling option', () => {
  const result = parseCliArguments(['--before', 'a.json', '--after', 'b.json', '--schedule', 'daily']);
  assert.equal(result.ok, false);
});

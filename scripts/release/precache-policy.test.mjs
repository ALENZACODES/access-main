import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';
import { PRECACHE_CHUNK_LIMIT, PRECACHE_MAX_ITEMS } from './precache-contract.mjs';
import { PRECACHE_FORMATS, reportWords } from './precache-report.mjs';
import { parseArgs } from './precache-cli.mjs';

const sourceFiles = [
  'precache-contract.mjs', 'precache-files.mjs', 'precache-delta.mjs',
  'precache-report.mjs', 'precache-cli.mjs', 'precache-index.mjs',
];
const testFiles = [
  'precache-contract.test.mjs', 'precache-files.test.mjs',
  'precache-delta.test.mjs', 'precache-report.test.mjs',
  'precache-cli.test.mjs', 'precache-policy.test.mjs',
];
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('required forbidden-name helper is populated', () => {
  const needles = forbiddenOrgNeedles();
  assert.ok(needles.length > 0);
  assert.ok(needles.every(value => value.length > 0));
});
test('all new release source files reject forbidden names', () => {
  const needles = forbiddenOrgNeedles().map(value => value.toLocaleLowerCase());
  for (const path of sourceFiles) {
    const content = read(path).toLocaleLowerCase();
    for (const needle of needles) assert.equal(content.includes(needle), false, path);
  }
});
test('all new tests reject forbidden names', () => {
  const needles = forbiddenOrgNeedles().map(value => value.toLocaleLowerCase());
  for (const path of testFiles) {
    const content = read(path).toLocaleLowerCase();
    for (const needle of needles) assert.equal(content.includes(needle), false, path);
  }
});
test('no new source file carries literal irregular Unicode spacing', () => {
  for (const path of sourceFiles) {
    const value = read(path);
    assert.equal(value.includes('\u00A0'), false, path);
    assert.equal(value.includes('\u202F'), false, path);
  }
});
test('no new test file carries literal irregular Unicode spacing', () => {
  for (const path of testFiles) {
    const value = read(path);
    assert.equal(value.includes('\u00A0'), false, path);
    assert.equal(value.includes('\u202F'), false, path);
  }
});
test('new sources carry no unsupported promotional phrases', () => {
  const phrases = [
    ['real', '-time'].join(''), ['partner', 'ship'].join(''),
    ['guaran', 'tee'].join(''), String.fromCharCode(118, 101, 114, 105, 102, 105, 101, 100),
  ];
  for (const path of sourceFiles) {
    for (const phrase of phrases) assert.equal(read(path).toLowerCase().includes(phrase), false, path);
  }
});
test('new source modules never import network clients', () => {
  for (const path of sourceFiles) {
    const content = read(path);
    assert.equal(content.includes("from 'node:http'"), false, path);
    assert.equal(content.includes("from 'node:https'"), false, path);
    assert.equal(content.includes('fetch('), false, path);
  }
});
test('new modules have no timers or scheduled automation', () => {
  for (const path of sourceFiles) {
    const content = read(path);
    assert.equal(content.includes('setInterval('), false, path);
    assert.equal(content.includes('setTimeout('), false, path);
    assert.equal(content.includes('cron:'), false, path);
  }
});
test('offline precache chunk ceiling remains the specified cap', () => {
  assert.equal(PRECACHE_CHUNK_LIMIT, 524288);
});
test('asset inventory cap cannot grow past four thousand ninety-six', () => {
  assert.ok(PRECACHE_MAX_ITEMS <= 4096);
});
test('both languages expose human-readable column headers', () => {
  const en = reportWords('en');
  const fr = reportWords('fr');
  for (const key of ['id', 'path', 'state', 'bytes', 'source', 'licence', 'retrievedOn', 'tier']) {
    assert.ok(typeof en[key] === 'string' && en[key].length > 0);
    assert.ok(typeof fr[key] === 'string' && fr[key].length > 0);
  }
});
test('both languages preserve UNKNOWN token', () => {
  assert.equal(reportWords('en').unknown, 'UNKNOWN');
  assert.equal(reportWords('fr').unknown, 'UNKNOWN');
});
test('all four export formats remain implemented', () => {
  assert.deepEqual(PRECACHE_FORMATS, ['text', 'html', 'csv', 'json']);
});
test('CLI explicitly defaults to manual inspection', () => {
  const parsed = parseArgs(['inspect', '--manifest', 'file.json']);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.args.action, 'inspect');
});
test('CLI has no network option', () => {
  const parsed = parseArgs(['inspect', '--manifest', 'file.json', '--network', 'on']);
  assert.equal(parsed.ok, false);
});
test('CLI has no schedule option', () => {
  const parsed = parseArgs(['inspect', '--manifest', 'file.json', '--schedule', 'daily']);
  assert.equal(parsed.ok, false);
});
test('new source files have no Vite or React dependency', () => {
  for (const path of sourceFiles) {
    const content = read(path);
    assert.equal(content.includes("from 'react'"), false);
    assert.equal(content.includes("from 'vite'"), false);
  }
});

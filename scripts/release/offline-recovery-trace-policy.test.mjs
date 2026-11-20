import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';
import * as publicApi from './offline-recovery-trace-index.mjs';
import { document, trace } from './offline-recovery-trace-fixtures.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const names = readdirSync(root).filter((name) => name.startsWith('offline-recovery-trace-'));
const sourceNames = names.filter((name) => name.endsWith('.mjs'));

test('every new source module uses the flat release directory', () => {
  assert.ok(sourceNames.length >= 10);
  assert.ok(sourceNames.every((name) => !name.includes('/')));
  assert.ok(sourceNames.every((name) => name.startsWith('offline-recovery-trace-')));
});
test('barrel exports the contract, analysis, reports, delta and CLI', () => {
  for (const name of ['TRACE_VERSION','inspectTraceDocument','parseTraceDocument',
    'analyzeRecoveryTraces','coverageGaps','triageRecoveryTraces',
    'compareRecoveryReleases','recoveryText','recoveryCsv','recoveryHtml',
    'runRecoveryCli','safeRead','safeWrite']) {
    assert.ok(name in publicApi, name);
  }
});
test('all authored code files use valid Unicode without literal NBSP or narrow NBSP', () => {
  for (const name of sourceNames) {
    const content = readFileSync(join(root, name), 'utf8');
    assert.equal(content.includes('\u00a0'), false, name);
    assert.equal(content.includes('\u202f'), false, name);
    assert.equal(content.includes('\ufffd'), false, name);
  }
});
test('forbidden organisation needles are absent from every new source', () => {
  const needles = forbiddenOrgNeedles().map((value) => value.toLowerCase());
  for (const name of sourceNames) {
    const content = readFileSync(join(root, name), 'utf8').toLowerCase();
    assert.ok(needles.every((value) => !content.includes(value)), name);
  }
});
test('no scheduled workflows, keep-awake or timer commands are introduced', () => {
  for (const name of sourceNames.filter((item) => !item.endsWith('.test.mjs'))) {
    const content = readFileSync(join(root, name), 'utf8');
    assert.ok(!content.includes('setInterval('), name);
    assert.ok(!content.includes('setTimeout('), name);
    assert.ok(!content.includes('cron:'), name);
    assert.ok(!content.includes('schedule:'), name);
  }
});
test('source modules do not perform network requests', () => {
  for (const name of sourceNames.filter((value) => !value.endsWith('.test.mjs'))) {
    const content = readFileSync(join(root, name), 'utf8');
    assert.ok(!content.includes('fetch('), name);
    assert.ok(!content.includes('XMLHttpRequest('), name);
  }
});
test('no new source file is a symlink or exceeds the file size limit', () => {
  for (const name of sourceNames) {
    const stat = lstatSync(join(root, name));
    assert.equal(stat.isSymbolicLink(), false, name);
    assert.ok(stat.size > 0 && stat.size < 50_000_000, name);
  }
});
test('all relative imports point at existing files', () => {
  for (const name of sourceNames) {
    const source = readFileSync(join(root, name), 'utf8');
    const imports = [...source.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/gu)];
    for (const match of imports) {
      assert.equal(lstatSync(resolve(root, dirname(name), match[1])).isFile(), true,
        `${name}: ${match[1]}`);
    }
  }
});
test('the public API accepts a synthetic UNKNOWN record without inventing facts', () => {
  const input = document(trace('synthetic', { steps: [] }));
  const result = publicApi.analyzeRecoveryTraces(input);
  assert.equal(result.ok, true);
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
});
test('public report API has EN and FR and never drops source provenance', () => {
  const input = document(trace());
  const en = publicApi.recoveryText(input, 'en');
  const fr = publicApi.recoveryText(input, 'fr');
  assert.ok(en.includes('CC0-1.0'));
  assert.ok(fr.includes('CC0-1.0'));
  assert.ok(fr.includes('Source\u00a0:'));
});
test('public HTML report has usable semantics and focus rule', () => {
  const html = publicApi.recoveryHtml(document());
  assert.ok(html.includes('<main>'));
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('<caption>'));
  assert.ok(html.includes('focus-visible'));
});
test('the release package script is manual, never scheduled', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['audit:recovery-traces'].includes('offline-recovery-trace-cli.mjs'));
  assert.ok(!Object.keys(pkg.scripts).some((name) => name.includes('schedule')));
  assert.ok(pkg.scripts.test.includes('*.test.mjs'));
});
test('UTF-8 output bytes are bounded and explicit', () => {
  const output = publicApi.formatRecoveryDocument(document(), 'json');
  assert.equal(output.ok, true);
  assert.ok(Buffer.byteLength(output.text, 'utf8') < 12_000_000);
});

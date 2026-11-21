/** Cross-module integration tests for release checks and policy boundaries. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';
import * as exports from './assistive-trace-index.mjs';
import { trace, TODAY } from './assistive-trace-fixtures.mjs';

const folder = dirname(fileURLToPath(import.meta.url));
const here = (name) => readFileSync(join(folder, name), 'utf8');
const files = () => readdirSync(folder).filter((name) => name.startsWith('assistive-trace-') && name.endsWith('.mjs'));
const options = { today: TODAY };

test('public barrel exports validation, replay, comparison and coverage', () => {
  for (const key of [
    'inspectTrace', 'parseTrace', 'canonicalTrace', 'fingerprintTrace',
    'replayTrace', 'compareReplays', 'coverageCells', 'coverageGaps',
    'coverageSummary', 'traceWorklist', 'exportReport', 'runCli',
  ]) assert.equal(typeof exports[key], 'function', key);
});
test('barrel exports explicit documented vocabularies', () => {
  assert.ok(exports.TRACE_STATES.includes('UNKNOWN'));
  assert.ok(exports.REPORT_FORMATS.includes('html'));
  assert.ok(exports.TRACE_CHANNELS.includes('announcement'));
});
test('barrel does not expose user profiles or network clients', () => {
  assert.equal('getUserProfile' in exports, false);
  assert.equal('fetchExternal' in exports, false);
});
test('policy suite examines all new JavaScript files', () => {
  const names = files();
  assert.ok(names.length >= 10);
  assert.ok(names.includes('assistive-trace-cli.mjs'));
  assert.ok(names.includes('assistive-trace-contract.mjs'));
});
test('all source files are well below the file-size ceiling', () => {
  for (const name of files()) assert.ok(statSync(join(folder, name)).size < 50_000_000, name);
});
test('all source is stored in the single flat release directory', () => {
  for (const name of files()) assert.equal(name.includes('/'), false);
});
test('all source files avoid literal nonbreaking spaces', () => {
  for (const name of files()) {
    const content = here(name);
    assert.equal(content.includes('\u00A0'), false, name);
    assert.equal(content.includes('\u202F'), false, name);
  }
});
test('French punctuation is emitted from escaped source sequences', () => {
  const content = here('assistive-trace-report.mjs');
  assert.ok(content.includes('\\u00A0'));
  assert.ok(content.includes('Langue'));
});
test('contract code stores conservative UNKNOWN state token', () => {
  assert.ok(here('assistive-trace-contract.mjs').includes("'UNKNOWN'"));
});
test('repository forbidden-name helper rejects all prohibited organization needles', () => {
  const needles = forbiddenOrgNeedles().map((name) => name.toLowerCase());
  for (const name of files()) {
    const text = here(name).toLowerCase();
    for (const needle of needles) assert.equal(text.includes(needle), false, name);
  }
});
test('no source includes artificial scheduled workflow configuration', () => {
  for (const name of files()) {
    const source = here(name);
    assert.equal(/on:\s*schedule|schedule:\s*\[|cron\s*:/u.test(source), false, name);
  }
});
test('manual CLI does not use timers to perform background jobs', () => {
  const content = here('assistive-trace-cli.mjs');
  assert.equal(content.includes('setInterval('), false);
  assert.equal(content.includes('setTimeout('), false);
});
test('manual CLI does not fetch external resources', () => {
  const content = here('assistive-trace-cli.mjs');
  assert.equal(/\bfetch\s*\(/u.test(content), false);
  assert.equal(content.includes('http.request'), false);
});
test('all source imports resolve to files or Node builtins', () => {
  for (const name of files()) {
    for (const match of here(name).matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu)) {
      const specifier = match[1];
      if (specifier.startsWith('node:')) continue;
      assert.ok(specifier.startsWith('./') || specifier.startsWith('../'), `${name}: ${specifier}`);
      const target = resolve(folder, specifier);
      assert.doesNotThrow(() => statSync(target), `${name}: ${specifier}`);
    }
  }
});
test('file includes a simple local CLI mount, not a build hook', () => {
  const content = here('assistive-trace-cli.mjs');
  assert.ok(content.includes('runCli('));
  assert.ok(content.includes('process.argv.slice(2)'));
});
test('public parser and release model agree on accepted sample', () => {
  const data = trace();
  const parsed = exports.parseTrace(JSON.stringify(data), options);
  assert.equal(parsed.ok, true);
  assert.equal(exports.replayTrace(parsed.document, options).ok, true);
});
test('all missing French coverage cells remain UNKNOWN throughout the exports', () => {
  const data = trace();
  const rows = exports.coverageCells(data, options).cells;
  assert.ok(rows.filter((cell) => cell.locale === 'fr').every((cell) => cell.state === 'UNKNOWN'));
  const csv = exports.csvReport(data, 'fr', options);
  assert.ok(csv.includes('"UNKNOWN"'));
});
test('French and English reports use language-specific headings', () => {
  const data = trace();
  assert.ok(exports.csvReport(data, 'en', options).includes('"Language"'));
  assert.ok(exports.csvReport(data, 'fr', options).includes('"Langue"'));
});
test('HTML and text outputs share the same recorded state', () => {
  const data = trace();
  const text = exports.textReport(data, 'en', options);
  const html = exports.htmlReport(data, 'en', options);
  assert.ok(text.includes('Recorded outcome: PASS'));
  assert.ok(html.includes('Recorded outcome: PASS'));
});
test('no helper mutates the caller trace during a complete analysis', () => {
  const data = trace();
  const original = JSON.stringify(data);
  exports.modelFor(data, options);
  exports.coverageCells(data, options);
  exports.replayTrace(data, options);
  exports.fingerprintTrace(data, options);
  assert.equal(JSON.stringify(data), original);
});
test('privacy-sensitive keys block all output formats consistently', () => {
  const data = trace(); data.journeys[0].token = 'sensitive-data';
  for (const format of exports.REPORT_FORMATS) {
    const result = exports.exportReport(data, format, 'en', options);
    assert.equal(result.ok, false);
    assert.equal(result.content, null);
  }
});
test('invalid provenance blocks all output formats consistently', () => {
  const data = trace(); data.sources[0].licence = 'private';
  for (const format of exports.REPORT_FORMATS) assert.equal(exports.exportReport(data, format, 'fr', options).ok, false);
});
test('report formats are bounded and not empty placeholders', () => {
  const data = trace();
  for (const format of exports.REPORT_FORMATS) {
    const result = exports.exportReport(data, format, 'fr', options);
    assert.equal(result.ok, true);
    assert.ok(Buffer.byteLength(result.content, 'utf8') > 100);
  }
});
test('review tasks do not insert extra success states', () => {
  const tasks = exports.traceWorklist(trace(), options).tasks;
  assert.ok(tasks.every((task) => task.status === 'UNKNOWN'));
});
test('shipped report content has no invented place observations', () => {
  const output = exports.textReport(trace(), 'en', options);
  assert.equal(/accessible entrance|accessible washroom|open now/iu.test(output), false);
});
test('change comparison cannot grant a PASS to a missing journey', () => {
  const original = trace();
  const later = trace(); later.journeys = [];
  const comparison = exports.compareReplays(original, later, options);
  assert.ok(comparison.changes.some((change) => change.after === 'UNKNOWN'));
});
test('replay findings contain no original event text values', () => {
  const data = trace();
  data.journeys[0].steps[0].events[1].state = 'UNKNOWN';
  const replay = exports.replayTrace(data, options);
  assert.ok(replay.result.findings.length);
  assert.equal(JSON.stringify(replay.result.findings).includes('Synthetic action'), false);
});

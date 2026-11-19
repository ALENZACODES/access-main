import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPORT_FORMATS, EXPORT_LANGUAGES, exportReviewPage,
  exportReviewGroups, exportAgeSummary, exportLabels,
} from './offline-review-export.mjs';
import { validateQueue, newQueue } from './offline-review-queue.mjs';

const TODAY = '2026-11-19';
const evidence = () => ({ source: 'https://example.test/source',
  licence: 'CC-BY-4.0', retrievedOn: TODAY, tier: 0 });
const record = (id = 'fixture-a', overrides = {}) => ({
  id, recordId: `record-${id}`, claimKey: 'accessibleEntrance',
  status: 'pending', reason: 'unknown-claim', state: 'UNKNOWN',
  createdOn: TODAY, label: { en: `Synthetic ${id}`, fr: `Fiche ${id}` },
  provenance: evidence(), history: [], ...overrides,
});
const queue = (...items) => ({ version: 1, items });
const checked = { today: TODAY };
const exportPage = (format = 'text', language = 'en', items = [record()], filters = {}) =>
  exportReviewPage(queue(...items), filters, { format, language }, checked);
const codes = (value) => value.problems.map(({ code }) => code);

test('formats and languages have bounded explicit vocabularies', () => {
  assert.deepEqual(EXPORT_FORMATS, ['json', 'csv', 'text', 'html']);
  assert.deepEqual(EXPORT_LANGUAGES, ['en', 'fr']);
  assert.equal(new Set(EXPORT_FORMATS).size, EXPORT_FORMATS.length);
});

test('every format exports valid synthetic queue', () => {
  for (const format of EXPORT_FORMATS) {
    const output = exportPage(format);
    assert.equal(output.ok, true, `${format}:${JSON.stringify(output.problems)}`);
    assert.equal(output.total, 1);
    assert.equal(output.shown, 1);
    assert.ok(output.content.length > 0);
    assert.ok(output.mediaType.includes('utf-8'));
  }
});

test('unknown format fails without any content', () => {
  const output = exportPage('xml');
  assert.equal(output.ok, false);
  assert.equal(output.content, null);
  assert.ok(codes(output).includes('FORMAT_INVALID'));
});

test('unknown language fails rather than guessing', () => {
  const output = exportPage('text', 'es');
  assert.equal(output.ok, false);
  assert.ok(codes(output).includes('LANGUAGE_INVALID'));
});

test('invalid queue cannot be exported', () => {
  const output = exportReviewPage(queue({ id: 'broken' }), {}, { format: 'json' });
  assert.equal(output.ok, false);
  assert.equal(output.content, null);
  assert.ok(codes(output).length);
});

test('invalid filter cannot lead to partial export', () => {
  const output = exportPage('text', 'en', [record()], { limit: 0 });
  assert.equal(output.ok, false);
  assert.equal(output.content, null);
});

test('empty review queue exports without invented entries', () => {
  for (const format of EXPORT_FORMATS) {
    const output = exportReviewPage(newQueue(), {}, { format });
    assert.equal(output.ok, true);
    assert.equal(output.total, 0);
    assert.equal(output.shown, 0);
  }
});

test('text output retains complete source metadata', () => {
  const output = exportPage('text').content;
  for (const field of ['https://example.test/source', 'CC-BY-4.0', TODAY, 'UNKNOWN']) {
    assert.ok(output.includes(field), field);
  }
});

test('text output contains a review-only caution', () => {
  const output = exportPage('text').content;
  assert.ok(output.includes('No claim of real-world accessibility'));
  assert.ok(output.includes('UNKNOWN remains UNKNOWN'));
});

test('French text output requires NBSP before label colons', () => {
  const output = exportPage('text', 'fr').content;
  assert.ok(output.includes('Source\u00A0:'));
  assert.ok(output.includes('Nombre de fiches\u00A0:'));
  assert.ok(output.includes('UNKNOWN reste UNKNOWN'));
});

test('French export uses curly apostrophes in user-facing sentences', () => {
  const output = exportPage('text', 'fr').content;
  assert.ok(output.includes('d’examen'));
  assert.ok(!output.includes("d'examen"));
});

test('CSV headers carry provenance fields and claim state', () => {
  const csv = exportPage('csv').content;
  const header = csv.split('\r\n')[0];
  for (const word of ['Source', 'Licence', 'Claim state', 'Retrieved on']) {
    assert.ok(header.includes(word));
  }
});

test('CSV doubles quotation marks inside fields', () => {
  const csv = exportPage('csv', 'en', [record('quoted', {
    label: { en: 'A "sample" label', fr: 'Une «\u202Ffiche\u202F»' },
  })]).content;
  assert.ok(csv.includes('"A ""sample"" label"'));
});

test('CSV begins spreadsheet formula-like values with protective apostrophe', () => {
  const csv = exportPage('csv', 'en', [record('formula', {
    label: { en: '=SUM(1,2)', fr: 'Exemple' },
  })]).content;
  assert.ok(csv.includes("\"'=SUM(1,2)\""));
});

test('CSV output is stable regardless of input insertion order', () => {
  const left = exportPage('csv', 'en', [record('b'), record('a')]).content;
  const right = exportPage('csv', 'en', [record('a'), record('b')]).content;
  assert.equal(left, right);
});

test('CSV does not include raw history or original references', () => {
  const event = { action: 'close', on: TODAY, to: 'closed' };
  const csv = exportPage('csv', 'en', [record('a', { status: 'closed', history: [event] })]).content;
  assert.ok(csv.includes('Review events'));
  assert.ok(!csv.includes('"action"'));
});

test('HTML has exactly one semantic main and one h1', () => {
  const html = exportPage('html').content;
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.ok(html.includes('<table>'));
});

test('HTML preserves source-readable table headings', () => {
  const html = exportPage('html').content;
  assert.ok(html.includes('<th scope="col">'));
  assert.ok(html.includes('<th scope="row">'));
  assert.ok(html.includes('<caption>Offline review listing</caption>'));
});

test('HTML provides keyboard-focusable horizontal overflow region', () => {
  const html = exportPage('html').content;
  assert.ok(html.includes('tabindex="0"'));
  assert.ok(html.includes('role="region"'));
  assert.ok(html.includes('focus-visible'));
});

test('HTML has responsive metadata and no remote font dependency', () => {
  const html = exportPage('html').content;
  assert.ok(html.includes('name="viewport"'));
  assert.ok(html.includes('system-ui'));
  assert.ok(!html.includes('fonts.googleapis.com'));
});

test('HTML escapes user-provided markup and attributes', () => {
  const html = exportPage('html', 'en', [record('esc', {
    label: { en: '<img src=x onerror=alert(1)>', fr: 'Fiche ordinaire' },
  })]).content;
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
});

test('HTML French report emits correct document language', () => {
  const html = exportPage('html', 'fr').content;
  assert.ok(html.includes('<html lang="fr">'));
  assert.ok(html.includes('UNKNOWN reste UNKNOWN'));
});

test('JSON preserves UNKNOWN verbatim in all locales', () => {
  for (const locale of EXPORT_LANGUAGES) {
    const data = JSON.parse(exportPage('json', locale).content);
    assert.equal(data.rows[0].state, 'UNKNOWN');
    assert.equal(data.language, locale);
  }
});

test('JSON escapes potentially executable markup in its text', () => {
  const text = exportPage('json', 'en', [record('html', {
    label: { en: '<script>alert(1)</script>', fr: 'Fiche' },
  })]).content;
  assert.ok(!text.includes('<script>'));
  assert.ok(text.includes('\\u003c'));
});

test('JSON includes source, licence, retrieved date and tier per record', () => {
  const data = JSON.parse(exportPage('json').content);
  for (const entry of data.rows) {
    assert.ok(entry.provenance.source);
    assert.ok(entry.provenance.licence);
    assert.ok(entry.provenance.retrievedOn);
    assert.notEqual(entry.provenance.tier, undefined);
  }
});

test('selected page is exported, never unbounded complete queue', () => {
  const items = [record('a'), record('b'), record('c')];
  const data = JSON.parse(exportPage('json', 'en', items, { limit: 1, offset: 1 }).content);
  assert.equal(data.total, 3);
  assert.deepEqual(data.rows.map((row) => row.id), ['b']);
});

test('group export supports exact source counts', () => {
  const result = exportReviewGroups(queue(record('a'), record('b')), 'source', {}, 'en', checked);
  assert.equal(result.ok, true);
  assert.ok(result.content.includes('https://example.test/source'));
  assert.ok(result.content.includes('"2"'));
});

test('group export refuses invalid group and language', () => {
  assert.equal(exportReviewGroups(queue(), 'unknown').ok, false);
  assert.equal(exportReviewGroups(queue(), 'state', {}, 'es').ok, false);
});

test('group export retains UNKNOWN token rather than translation', () => {
  const result = exportReviewGroups(queue(record()), 'state', {}, 'fr', checked);
  assert.ok(result.content.includes('UNKNOWN'));
});

test('age summary emits administrative cautions and no inferred features', () => {
  const result = exportAgeSummary(queue(record()), TODAY, {}, 'en', checked);
  assert.equal(result.ok, true);
  assert.ok(result.content.includes('Review item ages'));
  assert.ok(result.content.includes('UNKNOWN remains UNKNOWN'));
});

test('age summary treats unknown date input as error', () => {
  const result = exportAgeSummary(queue(record()), 'yesterday', {}, 'fr', checked);
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
});

test('age summary preserves French typography and UNKNOWN token', () => {
  const result = exportAgeSummary(queue(record()), TODAY, {}, 'fr', checked);
  assert.ok(result.content.includes('total\u00A0:'));
  assert.ok(result.content.includes('UNKNOWN reste UNKNOWN'));
});

test('export labels provide both language catalogues', () => {
  for (const locale of EXPORT_LANGUAGES) {
    const labels = exportLabels(locale);
    assert.ok(labels.title);
    assert.ok(labels.source);
    assert.ok(labels.noDecision.includes('UNKNOWN'));
  }
});

test('all export operations are referentially transparent', () => {
  const input = queue(record());
  const before = JSON.stringify(input);
  exportReviewPage(input, {}, { format: 'json' }, checked);
  exportReviewGroups(input, 'status', {}, 'en', checked);
  exportAgeSummary(input, TODAY, {}, 'fr', checked);
  assert.equal(JSON.stringify(input), before);
  assert.equal(validateQueue(input, checked).ok, true);
});

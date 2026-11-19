import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPORT_LANGUAGES, EXPORT_FORMATS, outputWords, exportImpactReview,
  parseImpactJson, exportImpactOverview,
} from './offline-impact-export.mjs';
import { buildTriageQueue, transitionTriage } from './offline-impact-triage.mjs';
import { IMPACT_VERSION } from './offline-impact-plan.mjs';

function impact(id = 'review-one', overrides = {}) {
  return { id, recordId: 'synthetic-record', claimKey: 'accessibleEntrance',
    state: 'UNKNOWN', reason: 'NEW_REVIEW_ITEM', level: 'review',
    path: '/items', before: null, after: null,
    action: 'HUMAN_REVIEW_REQUIRED', ...overrides };
}
function triage(...impacts) {
  const result = buildTriageQueue({ version: IMPACT_VERSION, impacts });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  return result.queue;
}
function report(queue, format = 'text', language = 'en') {
  const result = exportImpactReview(queue, format, language);
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  return result.content;
}
function codes(result) { return result.problems.map((entry) => entry.code); }

test('export languages and formats are explicit', () => {
  assert.deepEqual(EXPORT_LANGUAGES, ['en', 'fr']);
  assert.deepEqual(EXPORT_FORMATS, ['text', 'csv', 'html', 'json']);
});

test('each locale has a complete warning and title', () => {
  for (const lang of EXPORT_LANGUAGES) {
    const words = outputWords(lang);
    assert.equal(typeof words.title, 'string');
    assert.equal(typeof words.caution, 'string');
    assert.ok(words.title.length > 10);
    assert.ok(words.caution.length > 10);
  }
});

test('every locale uses uppercase UNKNOWN', () => {
  for (const lang of EXPORT_LANGUAGES) {
    assert.equal(outputWords(lang).unknown, 'UNKNOWN');
  }
});

test('empty text report retains warning and empty state', () => {
  const text = report(triage());
  assert.ok(text.includes('There are no review impacts'));
  assert.ok(text.includes('does not confirm'));
  assert.ok(text.endsWith('\n'));
});

test('empty French report contains correct caution', () => {
  const text = report(triage(), 'text', 'fr');
  assert.ok(text.includes('Aucune incidence'));
  assert.ok(text.includes('ne confirme pas'));
});

test('text reports include record, field, state and source path', () => {
  const text = report(triage(impact()));
  assert.ok(text.includes('synthetic-record'));
  assert.ok(text.includes('accessibleEntrance'));
  assert.ok(text.includes('UNKNOWN'));
  assert.ok(text.includes('/items'));
});

test('French text uses U+00A0 before a colon', () => {
  const text = report(triage(impact()), 'text', 'fr');
  assert.ok(text.includes('Fiche\u00A0:'));
  assert.ok(text.includes('Motif\u00A0:'));
  assert.equal(/(?<!\u00A0):/u.test(text), false);
});

test('French text uses curly apostrophe in the caution', () => {
  const text = report(triage(impact()), 'text', 'fr');
  assert.ok(text.includes('d’examen'));
  assert.equal(text.includes("d'examen"), false);
});

test('report does not change underlying claim state', () => {
  const original = triage(impact());
  const before = structuredClone(original);
  report(original, 'text', 'fr');
  assert.deepEqual(original, before);
});

test('report sorting is independent of packet order', () => {
  const first = triage(impact('z'), impact('a'));
  const second = triage(impact('a'), impact('z'));
  assert.equal(report(first), report(second));
});

test('text shows resolved status without implying confirmed facts', () => {
  const original = triage(impact());
  const updated = transitionTriage(original, original.items[0].key,
    'resolve', '2026-11-19');
  assert.equal(updated.ok, true);
  const text = report(updated.queue);
  assert.ok(text.includes('Resolved'));
  assert.ok(text.includes('UNKNOWN'));
});

test('CSV starts with a UTF-8 BOM for spreadsheet compatibility', () => {
  const text = report(triage(), 'csv');
  assert.ok(text.startsWith('\uFEFF'));
});

test('CSV uses CRLF line endings and quoted cells', () => {
  const text = report(triage(impact()), 'csv');
  assert.ok(text.includes('\r\n'));
  assert.ok(text.includes('"synthetic-record"'));
  assert.ok(text.endsWith('\r\n'));
});

test('CSV formula-looking record ID is neutralized or rejected', () => {
  const attempt = buildTriageQueue({ version: IMPACT_VERSION,
    impacts: [impact('=HYPERLINK("example")')] });
  assert.equal(attempt.ok, false);
});

test('CSV formula-looking claim name is refused before export', () => {
  const attempt = buildTriageQueue({ version: IMPACT_VERSION,
    impacts: [impact('safe', { claimKey: '+1+1' })] });
  assert.equal(attempt.ok, false);
});

test('CSV exports use a fixed bounded number of columns', () => {
  const text = report(triage(impact()), 'csv');
  const columns = text.trim().split('\r\n');
  assert.equal(columns.length, 2);
  assert.equal(columns[0].split(',').length, 7);
  assert.equal(columns[1].split(',').length, 7);
});

test('HTML has a single main landmark and h1 heading', () => {
  const text = report(triage(impact()), 'html');
  assert.ok(text.includes('<main>'));
  assert.equal((text.match(/<main>/g) ?? []).length, 1);
  assert.ok(text.includes('<h1>'));
});

test('HTML uses the chosen document language', () => {
  for (const language of EXPORT_LANGUAGES) {
    assert.ok(report(triage(), 'html', language).includes(`<html lang="${language}">`));
  }
});

test('HTML marks each table column header with scope', () => {
  const text = report(triage(impact()), 'html');
  assert.equal((text.match(/scope="col"/g) ?? []).length, 7);
});

test('HTML uses an explicit table caption', () => {
  const text = report(triage(impact()), 'html');
  assert.ok(text.includes('<caption>'));
  assert.ok(text.includes('</caption>'));
});

test('HTML includes a visible caution before the data table', () => {
  const text = report(triage(impact()), 'html');
  assert.ok(text.indexOf('does not confirm') < text.indexOf('<table>'));
});

test('HTML has a viewport meta tag for mobile scaling', () => {
  const text = report(triage(), 'html');
  assert.ok(text.includes('name="viewport"'));
  assert.ok(text.includes('width=device-width'));
});

test('HTML escapes special characters in visible data', () => {
  const original = triage(impact());
  original.items[0].recordId = 'safe&sample';
  const text = report(original, 'html');
  assert.ok(text.includes('safe&amp;sample'));
  assert.equal(text.includes('<script>'), false);
});

test('HTML does not contain external scripts, fonts or network images', () => {
  const text = report(triage(impact()), 'html');
  for (const unsafe of ['<script', '<iframe', '<img', '<link rel="stylesheet"']) {
    assert.equal(text.includes(unsafe), false);
  }
});

test('HTML status cells remain human-readable', () => {
  const original = triage(impact());
  const text = report(original, 'html', 'fr');
  assert.ok(text.includes('Ouvert'));
  assert.ok(text.includes('UNKNOWN'));
});

test('JSON export is parseable and has a fixed version', () => {
  const data = JSON.parse(report(triage(impact()), 'json'));
  assert.equal(data.version, 1);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].state, 'UNKNOWN');
});

test('JSON summary reports UNKNOWN count', () => {
  const data = JSON.parse(report(triage(impact('a'), impact('b')), 'json'));
  assert.equal(data.summary.UNKNOWN, 2);
  assert.equal(data.summary.total, 2);
});

test('JSON includes a caution string in the selected language', () => {
  const english = JSON.parse(report(triage(), 'json', 'en'));
  const french = JSON.parse(report(triage(), 'json', 'fr'));
  assert.notEqual(english.warning, french.warning);
  assert.ok(french.warning.includes('accessibilité'));
});

test('read-only JSON parser accepts generated report', () => {
  const text = report(triage(impact()), 'json');
  const result = parseImpactJson(text);
  assert.equal(result.ok, true);
  assert.equal(result.report.items[0].state, 'UNKNOWN');
});

test('JSON parser never converts review reports into source evidence', () => {
  const text = report(triage(impact()), 'json');
  const result = parseImpactJson(text);
  assert.equal(Object.hasOwn(result, 'queue'), false);
  assert.equal(Object.hasOwn(result, 'sourceVerified'), false);
});

test('JSON parser rejects invalid syntax without echoing input', () => {
  const text = '{ private-secret-data';
  const result = parseImpactJson(text);
  assert.equal(result.ok, false);
  assert.equal(result.report, null);
  assert.equal(JSON.stringify(result).includes('private-secret-data'), false);
});

test('JSON parser rejects unsupported report versions', () => {
  const data = JSON.parse(report(triage(), 'json'));
  data.version = 2;
  assert.ok(codes(parseImpactJson(JSON.stringify(data))).includes('REPORT_INVALID'));
});

test('JSON parser rejects invented claim state', () => {
  const data = JSON.parse(report(triage(impact()), 'json'));
  data.items[0].state = 'LIKELY';
  assert.ok(codes(parseImpactJson(JSON.stringify(data))).includes('ROW_STATE_INVALID'));
});

test('JSON parser rejects additional personal data fields in report rows', () => {
  const data = JSON.parse(report(triage(impact()), 'json'));
  data.items[0].email = 'private@example.org';
  assert.ok(codes(parseImpactJson(JSON.stringify(data))).includes('ROW_INVALID'));
});

test('JSON parser rejects unknown translation language', () => {
  const data = JSON.parse(report(triage(), 'json'));
  data.language = 'unknown';
  assert.ok(codes(parseImpactJson(JSON.stringify(data))).includes('REPORT_INVALID'));
});

test('JSON parser enforces maximum byte length', () => {
  const result = parseImpactJson(' '.repeat(8_000_001));
  assert.ok(codes(result).includes('INPUT_LIMIT'));
});

test('failed queue validation returns no partial report', () => {
  const original = triage(impact());
  original.items[0].state = 'inferred';
  const result = exportImpactReview(original, 'text', 'en');
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
});

test('unsupported format is rejected before rendering', () => {
  const result = exportImpactReview(triage(), 'pdf', 'en');
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('FORMAT_INVALID'));
});

test('unsupported locale is rejected before rendering', () => {
  const result = exportImpactReview(triage(), 'text', 'de');
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('LANGUAGE_INVALID'));
});

test('each format has an appropriate MIME type', () => {
  const expected = { text: 'text/plain', csv: 'text/csv',
    html: 'text/html', json: 'application/json' };
  for (const [format, mediaType] of Object.entries(expected)) {
    assert.ok(exportImpactReview(triage(), format).mediaType.startsWith(mediaType));
  }
});

test('overview lists every workflow status deterministically', () => {
  const result = exportImpactOverview(triage(impact()), 'en');
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('Open: 1'));
  assert.ok(result.text.includes('Deferred: 0'));
  assert.ok(result.text.includes('Resolved: 0'));
});

test('overview uses French nonbreaking colon spacing', () => {
  const result = exportImpactOverview(triage(impact()), 'fr');
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('Fiches\u00A0: 1'));
  assert.ok(result.text.includes('UNKNOWN\u00A0: 1'));
});

test('overview refuses invalid queues instead of counting bad data', () => {
  const original = triage(impact());
  original.items[0].status = 'undefined';
  const result = exportImpactOverview(original);
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});

test('report generation never mutates queue inputs', () => {
  const original = triage(impact());
  const before = structuredClone(original);
  for (const format of EXPORT_FORMATS) report(original, format, 'fr');
  assert.deepEqual(original, before);
});

test('all exported text retains UNKNOWN in capitals', () => {
  for (const format of EXPORT_FORMATS) {
    const text = report(triage(impact()), format, 'fr');
    assert.ok(text.includes('UNKNOWN'), format);
  }
});

test('no CSV or HTML export contains personal fields', () => {
  const current = triage(impact());
  for (const format of ['csv', 'html']) {
    const text = report(current, format);
    assert.equal(text.includes('healthCard'), false);
    assert.equal(text.includes('password'), false);
  }
});

test('overview and detailed report agree on item totals', () => {
  const current = triage(impact('a'), impact('b'));
  const overview = exportImpactOverview(current).text;
  const detailed = report(current);
  assert.ok(overview.includes('Items: 2'));
  assert.ok(detailed.includes('Items: 2'));
});

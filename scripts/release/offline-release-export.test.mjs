import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildReleaseAudit, renderReleaseText, renderReleaseHtml,
  renderReleaseCsv, renderReleaseJson, renderReleaseReport,
  renderDeltaText, renderDeltaHtml, renderDeltaCsv,
  renderDeltaJson, renderDeltaReport,
} from './offline-release-export.mjs';

const today = '2026-11-19';
const makeSource = (id = 'source') => ({ id, title: 'Open synthetic data',
  url: 'https://example.org/citation', licence: 'CC0-1.0',
  retrievedOn: today, tier: 0, review: 'pending' });
const makeAsset = (id = 'index') => ({ id, path: `${id}.html`,
  kind: 'html', size: 100, sha256: 'a'.repeat(64),
  state: 'included', cache: 'precache', dependsOn: [] });
const makeClaim = () => ({ id: 'entrance', recordId: 'fictional',
  field: 'stepFreeEntrance', state: 'UNKNOWN', sourceIds: ['source'] });
const release = () => ({ version: 1, releaseId: 'test-release',
  createdOn: today, locale: { en: true, fr: true },
  notice: { en: 'Do not infer access.', fr: 'Ne présumez pas l’accessibilité.' },
  sources: [makeSource()], assets: [makeAsset()], claims: [makeClaim()] });
const change = (fn) => {
  const next = release(); fn(next); next.releaseId = 'test-release-2'; return next;
};

// Exports operate exclusively on the supplied synthetic manifest.
test('audit reports structural counts and a fingerprint', () => {
  const report = buildReleaseAudit(release());
  assert.equal(report.ok, true);
  assert.equal(report.report.counts.claims, 1);
  assert.match(report.report.fingerprint, /^sha256:[a-f0-9]{64}$/u);
});
test('audit does not present UNKNOWN as an affirmative fact', () => {
  const report = buildReleaseAudit(release());
  assert.equal(report.report.counts.states.UNKNOWN, 1);
  assert.equal(report.report.counts.states.YES, 0);
});
test('audit includes provenance fields from source records', () => {
  const source = buildReleaseAudit(release()).report.sources[0];
  assert.equal(source.licence, 'CC0-1.0');
  assert.equal(source.retrievedOn, today);
  assert.equal(source.tier, 0);
});
test('audit rejects invalid source details rather than generating summary', () => {
  const input = release(); input.sources[0].licence = 'Unknown licence';
  const result = buildReleaseAudit(input);
  assert.equal(result.ok, false);
  assert.equal(result.report, null);
});
test('English text report contains release identifier and counts', () => {
  const output = renderReleaseText(release());
  assert.ok(output.includes('test-release'));
  assert.ok(output.includes('Claims: 1'));
});
test('English text report retains UNKNOWN token', () => {
  const output = renderReleaseText(release(), 'en');
  assert.ok(output.includes('UNKNOWN: 1'));
});
test('French text report keeps UNKNOWN untranslated', () => {
  const output = renderReleaseText(release(), 'fr');
  assert.ok(output.includes('UNKNOWN\u00A0: 1'));
});
test('French labels require NBSP before colon in rendered output', () => {
  const output = renderReleaseText(release(), 'fr');
  assert.ok(output.includes('Sources\u00A0: 1'));
  assert.ok(output.includes('Ressources\u00A0: 1'));
});
test('French text preserves curly apostrophes', () => {
  const output = renderReleaseText(release(), 'fr');
  assert.ok(output.includes('l’accessibilité'));
});
test('text export contains a limitation statement', () => {
  assert.ok(renderReleaseText(release()).includes('does not establish real-world accessibility'));
});
test('text report does not contact network or include private data', () => {
  const output = renderReleaseText(release());
  assert.ok(!output.includes('password'));
  assert.ok(!output.includes('bearer'));
});
test('English HTML contains language and viewport', () => {
  const output = renderReleaseHtml(release(), 'en');
  assert.match(output, /<html lang="en">/u);
  assert.ok(output.includes('name="viewport"'));
});
test('French HTML contains correct language attribute', () => {
  const output = renderReleaseHtml(release(), 'fr');
  assert.match(output, /<html lang="fr">/u);
});
test('HTML output has a single main landmark and h1', () => {
  const output = renderReleaseHtml(release());
  assert.equal((output.match(/<main\b/gu) ?? []).length, 1);
  assert.equal((output.match(/<h1>/gu) ?? []).length, 1);
});
test('HTML uses table captions and column-scoped headers', () => {
  const output = renderReleaseHtml(release());
  assert.ok(output.includes('<caption>'));
  assert.ok(output.includes('<th scope="col">'));
});
test('HTML tables have keyboard-scrollable containers', () => {
  const output = renderReleaseHtml(release());
  assert.ok(output.includes('tabindex="0"'));
  assert.ok(output.includes('role="region"'));
});
test('HTML creates visible focus outline for keyboard interaction', () => {
  const output = renderReleaseHtml(release());
  assert.ok(output.includes('focus-visible'));
  assert.ok(output.includes('outline:3px'));
});
test('HTML has no external fonts, scripts, trackers or remote map tiles', () => {
  const output = renderReleaseHtml(release());
  assert.equal(output.includes('<script'), false);
  assert.equal(output.includes('<link rel="stylesheet"'), false);
  assert.equal(output.includes('<iframe'), false);
});
test('HTML escapes dynamic release IDs and labels safely', () => {
  const input = release();
  input.releaseId = 'safe-id';
  input.sources[0].title = '<script>alert(1)</script>';
  const output = renderReleaseHtml(input);
  assert.equal(output.includes('<script>'), false);
});
test('HTML invalid state shows an alert instead of a reassuring summary', () => {
  const input = release(); input.claims[0].state = 'inferred';
  const output = renderReleaseHtml(input);
  assert.ok(output.includes('role="alert"'));
});
test('CSV header labels are quoted', () => {
  const output = renderReleaseCsv(release());
  assert.ok(output.startsWith('"Kind","Identifier","Path"'));
});
test('CSV output is deterministic across repeated exports', () => {
  const input = release();
  assert.equal(renderReleaseCsv(input), renderReleaseCsv(input));
});
test('CSV output ends with newline for portable processing', () => {
  assert.ok(renderReleaseCsv(release()).endsWith('\n'));
});
test('CSV reports an explicit invalid-source error', () => {
  const input = release(); input.sources[0].url = 'javascript:alert(1)';
  assert.ok(renderReleaseCsv(input).includes('SOURCE_URL'));
});
test('JSON export includes machine-readable counts and metadata', () => {
  const output = JSON.parse(renderReleaseJson(release()));
  assert.equal(output.ok, true);
  assert.equal(output.report.sources[0].licence, 'CC0-1.0');
});
test('JSON output excludes unrelated arbitrary fields', () => {
  const output = JSON.parse(renderReleaseJson(release()));
  assert.equal(Object.hasOwn(output, 'session'), false);
});
test('invalid JSON export has null report and diagnostic codes', () => {
  const input = release(); input.assets[0].cache = 'cloud-only';
  const output = JSON.parse(renderReleaseJson(input));
  assert.equal(output.report, null);
  assert.ok(output.issues.some((issue) => issue.code === 'ASSET_CACHE'));
});
test('format router supports text, HTML, CSV and JSON', () => {
  for (const format of ['text', 'html', 'csv', 'json']) {
    const result = renderReleaseReport(release(), format, 'en');
    assert.equal(result.ok, true, format);
    assert.equal(typeof result.content, 'string');
  }
});
test('format router rejects unsupported output format', () => {
  const result = renderReleaseReport(release(), 'pdf');
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
});
test('format router rejects unsupported locale', () => {
  const result = renderReleaseReport(release(), 'html', 'de');
  assert.equal(result.ok, false);
  assert.equal(result.content, null);
});
test('format router rejects invalid evidence before rendering', () => {
  const input = release(); input.claims[0].sourceIds = ['absent'];
  assert.equal(renderReleaseReport(input).ok, false);
});
test('English delta text describes changes and review count', () => {
  const later = change((input) => { input.claims[0].state = 'YES'; });
  const output = renderDeltaText(release(), later);
  assert.ok(output.includes('Review required: 1'));
});
test('French delta text preserves required colon spacing', () => {
  const later = change((input) => { input.claims[0].state = 'YES'; });
  const output = renderDeltaText(release(), later, 'fr');
  assert.ok(output.includes('Examen nécessaire\u00A0: 1'));
});
test('unchanged delta explicitly reports no changes', () => {
  const output = renderDeltaText(release(), release());
  assert.ok(output.includes('No changes'));
});
test('delta HTML includes accessible summary semantics', () => {
  const later = change((input) => { input.sources[0].review = 'reviewed'; });
  const output = renderDeltaHtml(release(), later, 'en');
  assert.ok(output.includes('<main'));
  assert.ok(output.includes('<caption>'));
});
test('delta HTML escapes source identifiers rather than injecting markup', () => {
  const later = change((input) => { input.claims[0].state = 'NO'; });
  const output = renderDeltaHtml(release(), later);
  assert.equal(output.includes('<script>'), false);
});
test('delta CSV has expected header and change classification', () => {
  const later = change((input) => { input.claims[0].state = 'YES'; });
  const output = renderDeltaCsv(release(), later);
  assert.ok(output.includes('claim-unknown-transition'));
});
test('delta CSV returns diagnostic rows for invalid evidence', () => {
  const later = change((input) => { input.assets[0].size = -10; });
  assert.ok(renderDeltaCsv(release(), later).includes('ASSET_SIZE'));
});
test('delta JSON includes exact change codes and summary counts', () => {
  const later = change((input) => { input.claims[0].state = 'YES'; });
  const output = JSON.parse(renderDeltaJson(release(), later));
  assert.equal(output.summary.unknownTransitions, 1);
});
test('delta report router supports all four formats', () => {
  const input = release();
  for (const format of ['text', 'html', 'csv', 'json']) {
    const result = renderDeltaReport(input, input, format, 'fr');
    assert.equal(result.ok, true, format);
  }
});
test('delta report router rejects invalid format and locale', () => {
  assert.equal(renderDeltaReport(release(), release(), 'pdf').ok, false);
  assert.equal(renderDeltaReport(release(), release(), 'text', 'xx').ok, false);
});
test('delta report refuses invalid later claims without producing content', () => {
  const later = change((input) => { input.claims[0].state = 'says accessible'; });
  const output = renderDeltaReport(release(), later, 'html');
  assert.equal(output.ok, false);
  assert.equal(output.content, null);
});
test('export module source uses escapes rather than literal invisible spaces', () => {
  const text = readFileSync(new URL('./offline-release-export.mjs', import.meta.url), 'utf8');
  assert.equal(text.includes('\u00A0'), false);
  assert.equal(text.includes('\u202F'), false);
});

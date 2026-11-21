import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, prepareReport, renderReport, reportCsvRows, reportTextLines } from './review-ledger-report.mjs';
import {
  TODAY, fixture, clone, observation, caseRecord, withConflict, openCase,
  multiPlaceFixture, closedCase, unsafeLabel, formulaValue
} from './review-ledger-fixtures.mjs';
const render = (data, options = {}) => renderReport(data, { today: TODAY, ...options });

test('HTML report declares English document language', () => {
  const result = render(fixture());
  assert.equal(result.ok, true);
  assert.match(result.text, /<html lang="en">/);
  assert.match(result.text, /Offline review ledger/);
});
test('HTML report declares French document language', () => {
  const result = render(fixture(), { language: 'fr' });
  assert.equal(result.ok, true);
  assert.match(result.text, /<html lang="fr">/);
  assert.match(result.text, /Registre d’examen hors ligne/);
});
test('HTML includes keyboard-accessible skip link', () => {
  const result = render(fixture());
  assert.match(result.text, /href="#main"/);
  assert.match(result.text, /min-height:44px/);
});
test('HTML has visible focus treatment', () => {
  const result = render(fixture());
  assert.match(result.text, /focus-visible/);
  assert.match(result.text, /outline:4px/);
});
test('HTML title and main region are semantic', () => {
  const result = render(fixture());
  assert.match(result.text, /<title>Offline review ledger<\/title>/);
  assert.match(result.text, /<main id="main">/);
  assert.match(result.text, /<h1>/);
});
test('HTML escapes untrusted evidence summary and source', () => {
  const data = fixture({ observations: [observation('obs-a', { source: unsafeLabel(), summary: unsafeLabel() })] });
  const result = render(data);
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.text, /<script>/);
  assert.match(result.text, /&lt;script&gt;/);
});
test('HTML escapes attacker-controlled case identifiers', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(5), '5');
});
test('HTML exposes provenance for each evidence record', () => {
  const result = render(fixture());
  assert.match(result.text, /Fictional test data/);
  assert.match(result.text, /CC0-1.0/);
  assert.match(result.text, /2026-11-20/);
  assert.match(result.text, /Verification tier/);
});
test('HTML does not use a reviewed decision as proof of accessibility', () => {
  const result = render(closedCase());
  assert.match(result.text, /reviewed/);
  assert.match(result.text, /UNKNOWN/);
  assert.match(result.text, /not a guarantee/);
});
test('French HTML uses nonbreaking space before colons', () => {
  const result = render(fixture(), { language: 'fr' });
  assert.match(result.text, /\u00a0:/u);
});
test('French text uses narrow nonbreaking space before semicolons', () => {
  const result = render(fixture(), { language: 'fr', format: 'text' });
  assert.match(result.text, /\u202f; /u);
  assert.match(result.text, /Dossiers\u00a0: 1\u202f; Fiches/u);
});
test('English text uses ordinary semicolon spacing', () => {
  const result = render(fixture(), { format: 'text' });
  assert.match(result.text, /; /);
});
test('French output keeps exact uppercase UNKNOWN', () => {
  for (const format of ['html', 'text', 'csv', 'json']) {
    const result = render(fixture(), { language: 'fr', format });
    assert.equal(result.ok, true);
    assert.match(result.text, /UNKNOWN/);
  }
});
test('CSV displays uppercase UNKNOWN rather than internal unknown tier', () => {
  const result = render(fixture(), { format: 'csv' });
  assert.match(result.text, /"UNKNOWN"/);
  assert.doesNotMatch(result.text, /"unknown"/);
});
test('CSV includes provenance columns', () => {
  const result = render(fixture(), { format: 'csv' });
  assert.match(result.text, /"source","licence","retrievedOn","verificationTier"/);
  assert.match(result.text, /CC0-1.0/);
});
test('CSV prevents formulas in a source field', () => {
  const data = fixture({ observations: [observation('obs-a', { source: formulaValue() })] });
  const result = render(data, { format: 'csv' });
  assert.match(result.text, /"'=SUM\(A1:A5\)"/);
});
test('CSV prevents formulas in a summary field', () => {
  const data = fixture({ observations: [observation('obs-a', { summary: '+CMD' })] });
  const result = render(data, { format: 'csv' });
  assert.match(result.text, /"'\+CMD"/);
});
test('CSV correctly quotes embedded commas and double quotes', () => {
  const data = fixture({ observations: [observation('obs-a', { summary: 'Quote "here", followed by comma' })] });
  const result = render(data, { format: 'csv' });
  assert.match(result.text, /"Quote ""here"", followed by comma"/);
});
test('CSV exports each evidence record once', () => {
  const result = render(multiPlaceFixture(), { format: 'csv' });
  assert.equal(result.text.trimEnd().split('\n').length, 5);
});
test('JSON preserves source, licence, date, tier and status', () => {
  const result = JSON.parse(render(fixture(), { format: 'json' }).text);
  const row = result.observations[0];
  assert.equal(row.source.includes('Fictional'), true);
  assert.equal(row.licence, 'CC0-1.0');
  assert.equal(row.retrievedOn, TODAY);
  assert.equal(row.verificationTier, 'UNKNOWN');
  assert.equal(row.status, 'UNKNOWN');
});
test('JSON keeps internal review status separate from evidence observations', () => {
  const result = JSON.parse(render(openCase(), { format: 'json' }).text);
  assert.equal(result.cases[0].state, 'open');
  assert.equal(result.observations[0].status, 'UNKNOWN');
});
test('JSON supports conflict reporting', () => {
  const result = JSON.parse(render(withConflict(), { format: 'json' }).text);
  assert.ok(result.findings.some(x => x.code === 'CONFLICT'));
  assert.equal(result.cases[0].status, 'UNKNOWN');
});
test('JSON includes explicit source reference in observations', () => {
  const result = JSON.parse(render(fixture(), { format: 'json' }).text);
  assert.equal(result.observations[0].id, 'obs-a');
  assert.equal(result.observations[0].source.length > 0, true);
});
test('all formats remain deterministic for identical input', () => {
  const data = fixture();
  for (const format of ['html', 'text', 'csv', 'json']) {
    assert.deepEqual(render(data, { format }), render(clone(data), { format }));
  }
});
test('all formats reject an unsupported language', () => {
  for (const format of ['html', 'text', 'csv', 'json']) {
    assert.equal(render(fixture(), { language: 'de', format }).ok, false);
  }
});
test('renderer rejects an unsupported output type', () => {
  assert.equal(render(fixture(), { format: 'pdf' }).ok, false);
  assert.equal(render(fixture(), { format: 'docx' }).ok, false);
});
test('renderer fails closed for a malformed ledger', () => {
  const result = render(fixture({ cases: [caseRecord('case-a', { observationIds: ['missing'] })] }));
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(x => x.code === 'MISSING_OBSERVATION'));
});
test('preparation rejects invalid before ledger', () => {
  const before = fixture({ schemaVersion: 4 });
  const result = prepareReport(fixture(), { before, today: TODAY });
  assert.equal(result.ok, false);
});
test('comparison exports demonstrate event addition', () => {
  const result = JSON.parse(render(openCase(), { before: fixture(), format: 'json' }).text);
  assert.equal(result.comparison.events.counts.added, 1);
});
test('comparison HTML has clear changes heading', () => {
  const result = render(openCase(), { before: fixture() });
  assert.match(result.text, /Differences since previous ledger/);
});
test('comparison French HTML has translated heading', () => {
  const result = render(openCase(), { before: fixture(), language: 'fr' });
  assert.match(result.text, /Différences depuis le registre précédent/);
});
test('text report includes every known provenance field', () => {
  const result = render(fixture(), { format: 'text' });
  for (const value of ['Source', 'Licence', 'Retrieved on', 'Verification tier', TODAY]) assert.ok(result.text.includes(value), value);
});
test('text report includes review risk without factual site guarantee', () => {
  const result = render(withConflict(), { format: 'text' });
  assert.match(result.text, /Conflicts/);
  assert.match(result.text, /UNKNOWN/);
  assert.match(result.text, /not a guarantee/);
});
test('reportCsvRows exposes stable rows for manual processing', () => {
  const result = reportCsvRows(fixture(), { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.lines.length, 2);
});
test('reportTextLines exposes stable lines for manual processing', () => {
  const result = reportTextLines(fixture(), { today: TODAY, language: 'fr' });
  assert.equal(result.ok, true);
  assert.ok(result.lines.length > 5);
});
test('reports handle legitimately empty ledgers', () => {
  const data = { schemaVersion: 1, observations: [], cases: [], events: [] };
  assert.equal(render(data, { format: 'html' }).ok, true);
  assert.match(render(data).text, /No cases/);
  assert.equal(render(data, { format: 'csv' }).text.trimEnd().split('\n').length, 1);
});

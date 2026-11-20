import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RETENTION_MESSAGES, retentionTextReport, retentionCsvReport,
  retentionHtmlReport, retentionJsonReport, retentionDeltaTextReport,
  retentionDeltaCsvReport, retentionDeltaJsonReport,
} from './offline-release-retention-report.mjs';

const day = '2026-11-19';
function file(id = 'asset', patch = {}) {
  return {
    id, path: `${id}.json`, kind: 'dataset', digest: 'c'.repeat(64),
    bytes: 512, state: 'present', claims: ['UNKNOWN'],
    source: 'https://example.org/open-source', licence: 'CC0-1.0',
    retrievedOn: day, tier: 0, references: [], events: [],
    labels: { en: 'Synthetic data', fr: 'Données fictives' }, ...patch,
  };
}
const document = (...records) => ({ version: 1, records });
function invalid(...d) { return document(file('invalid', { licence: 'Proprietary' }), ...d); }

// Presentation contract and no-claim wording.
test('both languages have complete report vocabulary', () => {
  const en = Object.keys(RETENTION_MESSAGES.en).sort();
  const fr = Object.keys(RETENTION_MESSAGES.fr).sort();
  assert.deepEqual(en, fr);
  for (const language of ['en', 'fr']) {
    for (const value of Object.values(RETENTION_MESSAGES[language])) {
      assert.equal(typeof value, 'string');
      assert.ok(value.length > 0);
    }
  }
});
test('French report vocabulary uses UNKNOWN literally', () => {
  assert.equal(RETENTION_MESSAGES.fr.unknown, 'UNKNOWN');
});
test('French caution does not claim compliance or certification', () => {
  assert.ok(RETENTION_MESSAGES.fr.caution.includes('ne confirme pas'));
});
test('English caution distinguishes document review from real place facts', () => {
  assert.ok(RETENTION_MESSAGES.en.caution.includes('not confirmation'));
});
test('empty text report has meaningful heading and empty state', () => {
  const result = retentionTextReport(document());
  assert.equal(result.ok, true);
  assert.ok(result.text.includes(RETENTION_MESSAGES.en.title));
  assert.ok(result.text.includes(RETENTION_MESSAGES.en.empty));
});
test('empty French text report has translated empty state', () => {
  const result = retentionTextReport(document(), 'fr');
  assert.equal(result.ok, true);
  assert.ok(result.text.includes(RETENTION_MESSAGES.fr.empty));
});
test('unknown locale defaults to English without throwing', () => {
  const result = retentionTextReport(document(file()), 'not-a-language');
  assert.ok(result.text.includes(RETENTION_MESSAGES.en.title));
});
test('single text report includes all mandated provenance elements', () => {
  const result = retentionTextReport(document(file()));
  assert.equal(result.ok, true);
  for (const value of ['https://example.org/open-source', 'CC0-1.0', day,
    'UNKNOWN', '0', 'Synthetic data']) assert.ok(result.text.includes(value), value);
});
test('French text report keeps ordinary NBSP before colons', () => {
  const output = retentionTextReport(document(file()), 'fr').text;
  assert.ok(output.includes('Source\u00A0:'));
  assert.ok(output.includes('Licence\u00A0:'));
  assert.ok(output.includes('Niveau\u00A0:'));
});
test('French report uses the literal UNKNOWN token', () => {
  const output = retentionTextReport(document(file()), 'fr').text;
  assert.ok(output.includes('UNKNOWN'));
  assert.equal(output.includes('Inconnu'), false);
});
test('text report is deterministic across record ordering', () => {
  const a = retentionTextReport(document(file('b'), file('a')));
  const b = retentionTextReport(document(file('a'), file('b')));
  assert.equal(a.text, b.text);
});
test('text reports do not mutate record labels', () => {
  const input = document(file());
  const before = JSON.stringify(input);
  retentionTextReport(input);
  assert.equal(JSON.stringify(input), before);
});
test('text report refuses a private field', () => {
  const result = retentionTextReport(document(file('a', { token: 'do-not-print' })));
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
  assert.equal(JSON.stringify(result).includes('do-not-print'), false);
});
test('text report refuses invalid source licence', () => {
  const result = retentionTextReport(invalid());
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((issue) => issue.code === 'LICENCE_INVALID'));
});
test('text report shows withdrawn state without approving claim', () => {
  const withdrawn = file('a', { state: 'withdrawn', events: [
    { action: 'withdraw', on: day, reason: 'Source removed' },
  ] });
  const result = retentionTextReport(document(withdrawn));
  assert.equal(result.ok, true);
  assert.ok(result.text.includes('withdrawn'));
  assert.ok(result.text.includes('UNKNOWN'));
});

// CSV spreadsheet-safe behaviour.
test('CSV has a BOM and deterministic CRLF records', () => {
  const result = retentionCsvReport(document(file()));
  assert.equal(result.ok, true);
  assert.ok(result.text.startsWith('\uFEFF'));
  assert.ok(result.text.endsWith('\r\n'));
});
test('CSV headings include provenance fields', () => {
  const result = retentionCsvReport(document());
  for (const field of ['Source', 'Licence', 'Retrieved', 'Tier', 'Digest']) {
    assert.ok(result.text.includes(`"${field}"`), field);
  }
});
test('French CSV headings are translated', () => {
  const result = retentionCsvReport(document(file()), 'fr');
  assert.ok(result.text.includes('"Consulté"'));
  assert.ok(result.text.includes('"Empreinte"'));
});
test('CSV neutralises leading equals formulas in labels', () => {
  const input = file('a', { labels: { en: '=1+1', fr: 'Données fictives' } });
  const output = retentionCsvReport(document(input)).text;
  assert.ok(output.includes("\"'=1+1\""));
});
test('CSV neutralises leading plus formulas in labels', () => {
  const input = file('a', { labels: { en: '+SUM(2,3)', fr: 'Données fictives' } });
  const output = retentionCsvReport(document(input)).text;
  assert.ok(output.includes("\"'+SUM(2,3)\""));
});
test('CSV neutralises leading minus formulas in labels', () => {
  const input = file('a', { labels: { en: '-2+3', fr: 'Données fictives' } });
  const output = retentionCsvReport(document(input)).text;
  assert.ok(output.includes("\"'-2+3\""));
});
test('CSV neutralises leading at formulas in labels', () => {
  const input = file('a', { labels: { en: '@SUM(A1:A2)', fr: 'Données fictives' } });
  const output = retentionCsvReport(document(input)).text;
  assert.ok(output.includes("\"'@SUM(A1:A2)\""));
});
test('CSV neutralises formula after leading whitespace', () => {
  const input = file('a', { labels: { en: ' =1+1', fr: 'Données fictives' } });
  const output = retentionCsvReport(document(input)).text;
  assert.ok(output.includes("\"' =1+1\""));
});
test('CSV escapes embedded double quotes without altering meaning', () => {
  const input = file('a', { labels: { en: 'An "example" file', fr: 'Données fictives' } });
  const output = retentionCsvReport(document(input)).text;
  assert.ok(output.includes('"An ""example"" file"'));
});
test('CSV does not mistake safe ordinary text for a formula', () => {
  const output = retentionCsvReport(document(file())).text;
  assert.ok(output.includes('"Synthetic data"'));
  assert.equal(output.includes("'Synthetic data"), false);
});
test('CSV refuses broken metadata rather than writing partial rows', () => {
  const result = retentionCsvReport(invalid());
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('CSV output ordering is independent of input array order', () => {
  const a = retentionCsvReport(document(file('z'), file('a')));
  const b = retentionCsvReport(document(file('a'), file('z')));
  assert.equal(a.text, b.text);
});

// Static HTML accessibility and injection prevention.
test('HTML declares language and accessible main landmark', () => {
  const output = retentionHtmlReport(document(file()), 'en').text;
  assert.ok(output.includes('<html lang="en">'));
  assert.ok(output.includes('<main>'));
  assert.ok(output.includes('<h1>'));
});
test('French HTML uses lang=fr and meaningful title', () => {
  const output = retentionHtmlReport(document(file()), 'fr').text;
  assert.ok(output.includes('<html lang="fr">'));
  assert.ok(output.includes(RETENTION_MESSAGES.fr.title));
});
test('HTML tables have captions and scoped column headers', () => {
  const output = retentionHtmlReport(document(file())).text;
  assert.ok(output.includes('<caption>'));
  assert.ok(output.includes('<th scope="col">'));
  assert.ok(output.includes('<thead>'));
  assert.ok(output.includes('<tbody>'));
});
test('HTML document has explicit UTF-8 encoding', () => {
  const output = retentionHtmlReport(document()).text;
  assert.ok(output.includes('<meta charset="utf-8">'));
});
test('HTML document has a viewport meta element', () => {
  const output = retentionHtmlReport(document()).text;
  assert.ok(output.includes('name="viewport"'));
});
test('HTML does not load scripts or external assets', () => {
  const output = retentionHtmlReport(document(file())).text;
  assert.equal(output.includes('<script'), false);
  assert.equal(output.includes('src='), false);
});
test('HTML escapes malicious markup inside user-provided labels', () => {
  const input = file('a', { labels: { en: '<img src=x onerror=alert(1)>', fr: 'Données fictives' } });
  const output = retentionHtmlReport(document(input)).text;
  assert.ok(output.includes('&lt;img'));
  assert.equal(output.includes('<img'), false);
});
test('HTML escapes double quotes and apostrophes in labels', () => {
  const input = file('a', { labels: { en: 'A "sample" and \'sample\'', fr: 'Données fictives' } });
  const output = retentionHtmlReport(document(input)).text;
  assert.ok(output.includes('&quot;sample&quot;'));
  assert.ok(output.includes('&#39;sample&#39;'));
});
test('HTML escapes ampersands in labels', () => {
  const input = file('a', { labels: { en: 'Data & notes', fr: 'Données fictives' } });
  const output = retentionHtmlReport(document(input)).text;
  assert.ok(output.includes('Data &amp; notes'));
});
test('empty HTML report includes a visible empty-state paragraph', () => {
  const output = retentionHtmlReport(document()).text;
  assert.ok(output.includes(RETENTION_MESSAGES.en.empty));
  assert.ok(output.includes('<p>'));
});
test('HTML retains the UNKNOWN token without inferring accessibility', () => {
  const output = retentionHtmlReport(document(file()), 'fr').text;
  assert.ok(output.includes('UNKNOWN'));
  assert.ok(output.includes(RETENTION_MESSAGES.fr.caution));
});
test('invalid HTML export returns no document', () => {
  const output = retentionHtmlReport(invalid());
  assert.equal(output.ok, false);
  assert.equal(output.text, null);
});

// JSON summaries and change reports.
test('JSON output is valid and machine-readable', () => {
  const output = retentionJsonReport(document(file()));
  assert.equal(output.ok, true);
  const parsed = JSON.parse(output.text);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.kind, 'offline-retention-report');
});
test('JSON report includes source, licence, retrievedOn and tier', () => {
  const parsed = JSON.parse(retentionJsonReport(document(file())).text);
  assert.equal(parsed.records[0].licence, 'CC0-1.0');
  assert.equal(parsed.records[0].tier, 0);
  assert.equal(parsed.records[0].retrievedOn, day);
});
test('JSON report summary counts UNKNOWN without upgrading it', () => {
  const parsed = JSON.parse(retentionJsonReport(document(file())).text);
  assert.equal(parsed.summary.byClaim.UNKNOWN, 1);
  assert.equal(parsed.summary.byClaim.YES, 0);
});
test('JSON export is deterministic across record order', () => {
  const first = retentionJsonReport(document(file('z'), file('a')));
  const second = retentionJsonReport(document(file('a'), file('z')));
  assert.equal(first.text, second.text);
});
test('JSON output rejects sensitive extra fields', () => {
  const output = retentionJsonReport(document(file('a', { email: 'private@example.org' })));
  assert.equal(output.ok, false);
  assert.equal(output.text, null);
});
test('delta text report states when there are no changes', () => {
  const input = document(file());
  const result = retentionDeltaTextReport(input, input, 'en');
  assert.equal(result.ok, true);
  assert.ok(result.text.includes(RETENTION_MESSAGES.en.noChanges));
});
test('French delta report includes UNKNOWN and a caution', () => {
  const before = document(file());
  const after = document(file('asset', { claims: ['YES'] }));
  const output = retentionDeltaTextReport(before, after, 'fr').text;
  assert.ok(output.includes('UNKNOWN'));
  assert.ok(output.includes(RETENTION_MESSAGES.fr.caution));
});
test('delta text report emits source provenance when available', () => {
  const before = document(file());
  const after = document(file('asset', { bytes: 513 }));
  const output = retentionDeltaTextReport(before, after).text;
  assert.ok(output.includes('https://example.org/open-source'));
  assert.ok(output.includes('CC0-1.0'));
  assert.ok(output.includes(day));
});
test('French delta text uses NBSP before colon', () => {
  const before = document(file());
  const after = document(file('asset', { bytes: 513 }));
  const output = retentionDeltaTextReport(before, after, 'fr').text;
  assert.ok(output.includes('Source\u00A0:'));
  assert.ok(output.includes('Licence\u00A0:'));
});
test('delta CSV has safe headings and BOM', () => {
  const output = retentionDeltaCsvReport(document(), document(file())).text;
  assert.ok(output.startsWith('\uFEFF'));
  assert.ok(output.includes('"change"'));
});
test('delta CSV preserves UNKNOWN on removed claims', () => {
  const output = retentionDeltaCsvReport(document(file()), document()).text;
  assert.ok(output.includes('UNKNOWN'));
  assert.ok(output.includes('removed'));
});
test('delta JSON reports counts separately from records', () => {
  const output = retentionDeltaJsonReport(document(), document(file()));
  const parsed = JSON.parse(output.text);
  assert.equal(parsed.summary.changes, 1);
  assert.equal(parsed.changes.length, 1);
  assert.equal(parsed.changes[0].kind, 'added');
});
test('delta JSON refuses invalid later snapshot', () => {
  const result = retentionDeltaJsonReport(document(), invalid());
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('delta report cannot silently call an unsupported claim YES', () => {
  const result = retentionDeltaTextReport(document(file()),
    document(file('asset', { claims: ['MAYBE'] })));
  assert.equal(result.ok, false);
  assert.equal(result.text, null);
});
test('every export returns the same invalidity on broken data', () => {
  const input = invalid();
  for (const report of [retentionTextReport, retentionCsvReport,
    retentionHtmlReport, retentionJsonReport]) {
    const output = report(input);
    assert.equal(output.ok, false);
    assert.ok(output.problems.length > 0);
  }
});

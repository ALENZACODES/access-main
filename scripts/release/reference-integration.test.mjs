import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, UNKNOWN } from './reference-contract.mjs';
import { reviewReferences, queueForReview } from './reference-review.mjs';
import { compareReferenceSets, proposedReviewItems } from './reference-delta.mjs';
import { renderReport } from './reference-report.mjs';
import { checkDecisionSet, reconcileDecisions, requiredNextActions, emptyDecisionSet } from './reference-policy.mjs';
import { execute } from './reference-cli.mjs';
import { DAY, entry, french, observed, snapshot, pair, clone } from './reference-fixtures.mjs';

const REVIEW_DATE = '2026-11-21';
function inspect(value) {
  const parsed = parseManifest(JSON.stringify(value), { today: REVIEW_DATE });
  assert.equal(parsed.ok, true, JSON.stringify(parsed.problems));
  const reviewed = reviewReferences(parsed.value, { today: REVIEW_DATE });
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed.problems));
  return reviewed.value;
}
function compare(before, after) {
  const result = compareReferenceSets(before, after, { today: REVIEW_DATE });
  assert.equal(result.ok, true);
  return result.value;
}
function decide(review, row) {
  const set = { schemaVersion: 1, reviewedOn: REVIEW_DATE, decisions: [row] };
  assert.equal(checkDecisionSet(set, review, { today: REVIEW_DATE }).ok, true);
  const result = reconcileDecisions(review, set, { today: REVIEW_DATE });
  assert.equal(result.ok, true);
  return result.value;
}
const human = (id, code, decision = 'acknowledged') => ({ id, code, decision, reviewer: 'Fictional release reviewer', decidedOn: DAY, reason: 'Documented as an example, without testing a website' });

test('a complete source-to-report pipeline retains UNKNOWN', () => {
  const reviewed = inspect(snapshot());
  assert.equal(reviewed.routes[0].unknown, 1);
  const html = renderReport(reviewed, { format: 'html', language: 'fr' });
  assert.ok(html.includes(UNKNOWN));
  assert.ok(html.includes('STATUS_UNKNOWN'));
});
test('the review pipeline does not infer availability from a syntactically valid HTTPS URL', () => {
  const reviewed = inspect(snapshot());
  assert.equal(reviewed.counts.review > 0, true);
  assert.ok(!JSON.stringify(reviewed).includes('networkChecked'));
});
test('bilingual pair preserves both source labels', () => {
  const original = pair();
  const review = inspect(original);
  assert.equal(review.total, 2);
  assert.equal(review.routes[0].english, 1);
  assert.equal(review.routes[0].french, 1);
  assert.equal(original.references[0].label, 'Fictional guidance');
  assert.equal(original.references[1].label, 'Conseils fictifs');
});
test('a bilingual review emits a French HTML page with correct language', () => {
  const html = renderReport(inspect(pair()), { format: 'html', language: 'fr' });
  assert.ok(html.includes('<html lang="fr">'));
  assert.ok(html.includes('Examen des liens externes'));
});
test('a bilingual review emits a distinct English HTML page', () => {
  const html = renderReport(inspect(pair()), { format: 'html', language: 'en' });
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes('Outbound reference review'));
});
test('source-supplied markup remains escaped across the entire pipeline', () => {
  const manifest = snapshot(entry({ label: '<svg onload=alert(1)>' }));
  const reviewed = inspect(manifest);
  const html = renderReport(reviewed, { format: 'html' });
  assert.ok(!html.includes('<svg'));
});
test('tracking parameters are disclosed without deleting or changing the URL', () => {
  const manifest = snapshot(entry({ destination: 'https://example.org/resources?utm_source=test' }));
  const copy = clone(manifest);
  const reviewed = inspect(manifest);
  assert.ok(reviewed.findings.some(row => row.code === 'TRACKING_PARAMETERS'));
  assert.deepEqual(manifest, copy);
});
test('an invalid HTTP destination cannot reach any renderer', () => {
  const parsed = parseManifest(JSON.stringify(snapshot(entry({ destination: 'http://example.org' }))));
  assert.equal(parsed.ok, false);
  assert.ok(parsed.problems.some(problem => problem.includes('URL_SCHEME')));
});
test('a localhost URL cannot enter a release report', () => {
  const parsed = parseManifest(JSON.stringify(snapshot(entry({ destination: 'https://localhost/secret' }))));
  assert.equal(parsed.ok, false);
});
test('a query-embedded credential cannot enter a release report', () => {
  const parsed = parseManifest(JSON.stringify(snapshot(entry({ destination: 'https://example.org/?api_key=secret' }))));
  assert.equal(parsed.ok, false);
});
test('an unknown status remains unknown through a before-after comparison', () => {
  const diff = compare(snapshot(entry()), snapshot(observed()));
  assert.equal(diff.changes[0].classification, 'indeterminate');
  const txt = renderReport(inspect(snapshot(observed())), { format: 'text', delta: diff });
  assert.ok(txt.includes('indeterminate'));
});
test('an observed regression generates a review proposal but no automated action', () => {
  const diff = compare(snapshot(observed()), snapshot(observed({ status: 'UNAVAILABLE' })));
  assert.equal(proposedReviewItems(diff).length, 1);
  assert.equal(proposedReviewItems(diff)[0].classification, 'recorded-regression');
});
test('a snapshot diff can be rendered to the French text format', () => {
  const diff = compare(snapshot(entry()), snapshot(observed()));
  const txt = renderReport(inspect(snapshot(observed())), { format: 'text', language: 'fr', delta: diff });
  assert.ok(txt.includes('Relevé précédent'));
  assert.ok(txt.includes('Relevé suivant'));
});
test('a snapshot diff can be rendered into machine-readable JSON', () => {
  const diff = compare(snapshot(entry()), snapshot(observed()));
  const output = JSON.parse(renderReport(inspect(snapshot(observed())), { format: 'json', delta: diff }));
  assert.equal(output.delta.changes[0].classification, 'indeterminate');
});
test('a snapshot diff can be rendered to CSV with changed rows', () => {
  const diff = compare(snapshot(entry()), snapshot(observed()));
  const output = renderReport(inspect(snapshot(observed())), { format: 'csv', delta: diff });
  assert.ok(output.includes('CHANGE_MODIFIED'));
});
test('a human decision does not change the original recorded status', () => {
  const review = inspect(snapshot());
  const signed = decide(review, human('en:fictional-guide', 'STATUS_UNKNOWN'));
  assert.equal(signed.summary.acknowledged, 1);
  assert.ok(review.findings.some(row => row.code === 'STATUS_UNKNOWN'));
});
test('acknowledging a missing language counterpart does not create translation data', () => {
  const review = inspect(snapshot());
  const signed = decide(review, human('en:fictional-guide', 'PAIR_LANGUAGE_MISSING'));
  assert.equal(signed.summary.acknowledged, 1);
  assert.equal(review.total, 1);
});
test('a human needs-source decision produces a manual follow-up queue', () => {
  const review = inspect(snapshot());
  const signed = decide(review, human('en:fictional-guide', 'STATUS_UNKNOWN', 'needs-source'));
  assert.ok(requiredNextActions(signed).some(row => row.next === 'collect-source'));
});
test('a deferred human decision produces manual follow-up metadata', () => {
  const review = inspect(snapshot());
  const signed = decide(review, human('en:fictional-guide', 'STATUS_UNKNOWN', 'deferred'));
  assert.ok(requiredNextActions(signed).some(row => row.next === 'follow-up'));
});
test('empty review decisions cannot silently clear findings', () => {
  const review = inspect(snapshot());
  const signed = reconcileDecisions(review, emptyDecisionSet(DAY));
  assert.equal(signed.value.summary.unreviewed, review.findings.length);
});
test('review queue remains stable after manual decisions', () => {
  const review = inspect(snapshot());
  const before = queueForReview(review);
  decide(review, human('en:fictional-guide', 'STATUS_UNKNOWN'));
  assert.deepEqual(queueForReview(review), before);
});
test('one source can hold different locale-specific links without false duplicate status', () => {
  const reviewed = inspect(snapshot(entry(), french({ destination: 'https://example.org/fr' })));
  assert.equal(reviewed.total, 2);
  assert.ok(!reviewed.findings.some(row => row.code === 'DESTINATION_DUPLICATED'));
});
test('review findings are ordered so repeated exports remain byte-identical', () => {
  const reviewed = inspect(pair());
  const first = renderReport(reviewed, { format: 'json' });
  const second = renderReport(reviewed, { format: 'json' });
  assert.equal(first, second);
});
test('source order cannot reorder the route review groups', () => {
  const left = inspect(snapshot(entry({ route: '/places' }), french({ route: '/help' })));
  const right = inspect(snapshot(french({ route: '/help' }), entry({ route: '/places' })));
  assert.deepEqual(left.routes, right.routes);
});
test('local CLI accepts a valid manifest and renders French text to memory', async () => {
  let output = '';
  const result = await execute(['--after', 'fictional.json', '--language', 'fr', '--today', DAY], {
    read: async () => JSON.stringify(pair()),
    stdout: { write(value) { output += value; } },
    stderr: { write() { throw Error('unexpected stderr'); } },
  });
  assert.equal(result, 0);
  assert.ok(output.includes('Examen des liens externes'));
});
test('local CLI compares two manifest snapshots and exports JSON', async () => {
  let output = '';
  const result = await execute(['--after', 'next.json', '--before', 'prior.json', '--format', 'json', '--today', DAY], {
    read: async path => JSON.stringify(path === 'prior.json' ? snapshot(entry()) : snapshot(observed())),
    stdout: { write(value) { output += value; } },
    stderr: { write() { throw Error('unexpected stderr'); } },
  });
  assert.equal(result, 0);
  assert.equal(JSON.parse(output).delta.changes[0].classification, 'indeterminate');
});
test('local CLI cannot make a comparison when the earlier file is invalid', async () => {
  let output = '', error = '';
  const result = await execute(['--after', 'next.json', '--before', 'prior.json', '--today', DAY], {
    read: async path => path === 'prior.json' ? '{}' : JSON.stringify(pair()),
    stdout: { write(value) { output += value; } },
    stderr: { write(value) { error += value; } },
  });
  assert.equal(result, 2);
  assert.equal(output, '');
  assert.ok(error.includes('BEFORE:'));
});
test('reported issues never add an external link opening action', () => {
  const report = inspect(pair());
  for (const finding of report.findings) {
    assert.ok(!Object.hasOwn(finding, 'open'));
    assert.ok(!Object.hasOwn(finding, 'navigationAction'));
  }
});
test('entire pipeline leaves fictional source records unchanged', () => {
  const manifest = pair();
  const previous = clone(manifest);
  const report = inspect(manifest);
  const diff = compare(manifest, manifest);
  renderReport(report, { format: 'html', delta: diff });
  reconcileDecisions(report, emptyDecisionSet(DAY));
  assert.deepEqual(manifest, previous);
});
test('each report format preserves explicit limitations about live checks', () => {
  const review = inspect(snapshot());
  for (const format of ['html', 'text']) {
    const output = renderReport(review, { format });
    assert.ok(output.includes('not opened'), format);
  }
});
test('an empty snapshot has no findings and no inferred passes', () => {
  const review = inspect({ schemaVersion: 1, capturedOn: DAY, references: [] });
  assert.equal(review.total, 0);
  assert.deepEqual(review.findings, []);
  assert.deepEqual(review.routes, []);
});
test('empty inventory report still explains that destinations were not checked', () => {
  const report = inspect({ schemaVersion: 1, capturedOn: DAY, references: [] });
  assert.ok(renderReport(report, { format: 'text' }).includes('destinations were not checked'));
});
test('cross-module review count equals all priority counts', () => {
  const report = inspect(pair());
  assert.equal(report.findings.length, report.counts.review + report.counts.caution + report.counts.info);
});

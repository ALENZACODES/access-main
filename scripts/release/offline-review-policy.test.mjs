import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';
import { queryReviews } from './offline-review-query.mjs';
import { reconcileQueues } from './offline-review-sync.mjs';
import { exportReviewPage } from './offline-review-export.mjs';
import { frenchSpacingIssues, newQueue } from './offline-review-queue.mjs';

const files = [
  'offline-review-query.mjs', 'offline-review-query.test.mjs',
  'offline-review-sync.mjs', 'offline-review-sync.test.mjs',
  'offline-review-export.mjs', 'offline-review-export.test.mjs',
  'offline-review-queue.mjs', 'offline-review-queue.test.mjs',
];

test('P19 output source does not contain forbidden organisation identifiers', () => {
  const needles = forbiddenOrgNeedles().map((value) => value.toLowerCase());
  for (const name of files) {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8').toLowerCase();
    assert.ok(needles.every((needle) => !source.includes(needle)), name);
  }
});

test('P19 source never contains literal no-break whitespace', () => {
  for (const name of files) {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8');
    assert.equal(source.includes(String.fromCodePoint(160)), false, name);
    assert.equal(source.includes(String.fromCodePoint(8239)), false, name);
  }
});

test('shared French validator requires narrow space at each punctuation site', () => {
  for (const punctuation of [';', '!', '?']) {
    assert.deepEqual(frenchSpacingIssues(`Oui\u202F${punctuation}`, '/fr'), []);
    assert.ok(frenchSpacingIssues(`Oui\u00A0${punctuation}`, '/fr').length > 0);
  }
  assert.deepEqual(frenchSpacingIssues('«\u202Ftest\u202F»', '/fr'), []);
  assert.ok(frenchSpacingIssues('«\u00A0test\u00A0»', '/fr').length > 0);
  assert.deepEqual(frenchSpacingIssues('Source\u00A0:', '/fr'), []);
  assert.ok(frenchSpacingIssues('Source\u202F:', '/fr').length > 0);
});

test('empty review workflows have no positive accessibility findings', () => {
  const empty = newQueue();
  assert.deepEqual(queryReviews(empty).rows, []);
  assert.deepEqual(reconcileQueues(empty, empty, empty).merged.items, []);
  for (const language of ['en', 'fr']) {
    const html = exportReviewPage(empty, {}, { format: 'html', language });
    assert.equal(html.ok, true);
    assert.ok(html.content.includes('UNKNOWN'));
  }
});

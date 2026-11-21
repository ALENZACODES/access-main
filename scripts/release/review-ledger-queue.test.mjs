import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  priorityFor, reviewQueue, placeCoverage, readinessChecklist, categoryStatistics, explainPriority
} from './review-ledger-queue.mjs';
import { FEATURES } from './review-ledger-contract.mjs';
import {
  TODAY, fixture, clone, withFeature, withConflict,
  waitingCase, deferredCase, closedCase, multiPlaceFixture, observation, caseRecord
} from './review-ledger-fixtures.mjs';
const queue = (data, options = {}) => reviewQueue(data, { today: TODAY, ...options });
const coverage = (data, options = {}) => placeCoverage(data, { today: TODAY, ...options });
const checklist = data => readinessChecklist(data, { today: TODAY });

test('review queue includes pending new case', () => {
  const result = queue(fixture());
  assert.equal(result.ok, true);
  assert.equal(result.counts.pending, 1);
  assert.equal(result.rows[0].state, 'new');
});
test('queue omits closed cases by default', () => {
  assert.equal(queue(closedCase()).rows.length, 0);
  assert.equal(queue(closedCase(), { includeClosed: true }).rows.length, 1);
});
test('queue includes waiting and deferred cases', () => {
  assert.equal(queue(waitingCase()).rows[0].state, 'waiting');
  assert.equal(queue(deferredCase()).rows[0].state, 'deferred');
});
test('queue exposes conflicting evidence without declaring accessibility', () => {
  const result = queue(withConflict());
  assert.equal(result.counts.conflict, 1);
  assert.equal(result.rows[0].status, 'UNKNOWN');
});
test('queue assigns greater priority to contradictory reports', () => {
  const conflict = queue(withConflict()).rows[0].priority;
  const plain = queue(fixture()).rows[0].priority;
  assert.ok(conflict > plain);
});
test('queue contains required feature and place identifiers', () => {
  const result = queue(multiPlaceFixture());
  assert.equal(result.rows.length, 4);
  assert.ok(result.rows.every(row => row.placeId && row.feature && row.id));
});
test('queue filters a specified place without mixing records', () => {
  const result = queue(multiPlaceFixture(), { placeId: 'fictional-other' });
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every(row => row.placeId === 'fictional-other'));
});
test('queue filters feature categories deterministically', () => {
  const result = queue(multiPlaceFixture(), { feature: 'washroom' });
  assert.deepEqual(result.rows.map(x => x.id), ['case-c']);
});
test('queue rejects invented feature categories', () => {
  const result = queue(fixture(), { feature: 'medical-clearance' });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(x => x.code === 'FEATURE_INVALID'));
});
test('queue rejects invalid today before ranking evidence', () => {
  const result = queue(fixture(), { today: 'tomorrow' });
  assert.equal(result.ok, false);
});
test('queue preserves deterministic ranking for identical inputs', () => {
  const data = multiPlaceFixture();
  assert.deepEqual(queue(data), queue(clone(data)));
});
test('priority explanations describe review problems only', () => {
  const row = queue(fixture()).rows[0];
  const explanations = explainPriority(row);
  assert.ok(explanations.some(x => x.includes('UNKNOWN')));
  assert.ok(explanations.some(x => x.includes('opened')));
  assert.equal(explanations.some(x => x.includes('eligible')), false);
});
test('priority explanations mention evidence conflicts', () => {
  const row = queue(withConflict()).rows[0];
  assert.ok(explainPriority(row).some(x => x.includes('Conflicting')));
});
test('priority explanations mention waiting requests', () => {
  const row = queue(waitingCase()).rows[0];
  assert.ok(explainPriority(row).some(x => x.includes('requested')));
});
test('priorityFor penalizes unresolved conflicts', () => {
  const row = { workflow: { state: 'open' } };
  assert.ok(priorityFor(row, [{ code: 'CONFLICT' }]) > priorityFor(row, [{ code: 'NO_DOCUMENT_HASH' }]));
});
test('priorityFor cannot become negative for closed case', () => {
  const row = { workflow: { state: 'closed' } };
  assert.equal(priorityFor(row, []), 0);
});
test('place coverage has explicit UNKNOWN for absent categories', () => {
  const result = coverage(fixture());
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].features.length, FEATURES.length);
  assert.equal(result.rows[0].unknownCategories, FEATURES.length);
});
test('place coverage never infers an accessible entrance', () => {
  const result = coverage(withFeature('entrance', 'reported'));
  assert.equal(result.rows[0].features[0].status, 'reported');
  assert.notEqual(result.rows[0].features[0].status, 'accessible');
});
test('place coverage respects explicitly selected categories', () => {
  const result = coverage(fixture(), { expectedFeatures: ['entrance', 'parking'] });
  assert.deepEqual(result.rows[0].features.map(x => x.feature), ['entrance', 'parking']);
});
test('place coverage refuses unsupported categories', () => {
  const result = coverage(fixture(), { expectedFeatures: ['parking', 'medicine'] });
  assert.equal(result.ok, false);
});
test('place coverage refuses duplicate requested categories', () => {
  const result = coverage(fixture(), { expectedFeatures: ['parking', 'parking'] });
  assert.equal(result.ok, false);
});
test('place coverage handles a zero-category selection', () => {
  const result = coverage(fixture(), { expectedFeatures: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows[0].features, []);
});
test('place coverage groups separate fictional places correctly', () => {
  const result = coverage(multiPlaceFixture(), { expectedFeatures: ['entrance', 'parking', 'washroom'] });
  assert.deepEqual(result.rows.map(x => x.placeId), ['fictional-other', 'fictional-place']);
  assert.equal(result.rows[0].availableEvidenceCategories, 2);
  assert.equal(result.rows[1].availableEvidenceCategories, 1);
});
test('place coverage preserves contradictions as UNKNOWN', () => {
  const result = coverage(withConflict(), { expectedFeatures: ['entrance'] });
  assert.equal(result.rows[0].features[0].status, 'UNKNOWN');
  assert.equal(result.rows[0].features[0].conflicting, true);
});
test('place coverage refuses to infer from a missing case', () => {
  const data = fixture({ cases: [], observations: [observation()] });
  const result = coverage(data, { expectedFeatures: ['entrance'] });
  assert.equal(result.rows[0].features[0].status, 'UNKNOWN');
  assert.equal(result.rows[0].features[0].observed, false);
});
test('review checklist distinguishes workflow and coverage completeness', () => {
  const result = checklist(fixture());
  assert.equal(result.ok, true);
  assert.equal(result.reviewComplete, false);
  assert.equal(result.evidenceComplete, false);
});
test('review checklist refuses to equate review with accessibility', () => {
  const result = checklist(closedCase());
  assert.equal(result.reviewComplete, true);
  assert.match(result.notice, /not a statement/);
});
test('review checklist reports expected absent categories', () => {
  const result = checklist(fixture());
  assert.ok(result.reasons.some(x => x.code === 'MISSING_CATEGORIES'));
});
test('review checklist reports active conflicts', () => {
  const result = checklist(withConflict());
  assert.ok(result.reasons.some(x => x.code === 'CONFLICTS_PRESENT'));
});
test('review checklist reports UNKNOWN even when case is closed', () => {
  const result = checklist(closedCase());
  assert.ok(result.reasons.some(x => x.code === 'UNKNOWN_PRESENT'));
});
test('categoryStatistics returns every supported category', () => {
  const result = categoryStatistics(fixture(), { today: TODAY });
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows.map(x => x.feature), FEATURES);
});
test('categoryStatistics counts observations separately from cases', () => {
  const data = withConflict();
  const result = categoryStatistics(data, { today: TODAY });
  assert.equal(result.rows[0].cases, 1);
  assert.equal(result.rows[0].observations, 2);
});
test('categoryStatistics tracks UNKNOWN and conflicting categories', () => {
  const result = categoryStatistics(withConflict(), { today: TODAY });
  assert.equal(result.rows[0].unknown, 1);
  assert.equal(result.rows[0].conflicts, 1);
});
test('categoryStatistics does not count closed cases as open', () => {
  const result = categoryStatistics(closedCase(), { today: TODAY });
  assert.equal(result.rows[0].open, 0);
});
test('categoryStatistics fails closed on invalid linked evidence', () => {
  const data = fixture({ cases: [caseRecord('case-a', { observationIds: ['not-present'] })] });
  assert.equal(categoryStatistics(data, { today: TODAY }).ok, false);
});
test('queue priority never changes the declared evidence tier', () => {
  const data = fixture();
  const originalTier = data.observations[0].verificationTier;
  queue(data);
  assert.equal(data.observations[0].verificationTier, originalTier);
});

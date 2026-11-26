import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISIONS, checkDecisionSet, reconcileDecisions, requiredNextActions,
  emptyDecisionSet,
} from './reference-policy.mjs';
import { reviewReferences } from './reference-review.mjs';
import { DAY, snapshot, pair } from './reference-fixtures.mjs';

const report = () => reviewReferences(snapshot(), { today: DAY }).value;
const decision = (changes = {}) => ({ id: 'en:fictional-guide', code: 'STATUS_UNKNOWN', decision: 'needs-source', reviewer: 'Fictional human reviewer', decidedOn: DAY, reason: 'No observation was supplied', ...changes });
const decisions = (...rows) => ({ schemaVersion: 1, reviewedOn: DAY, decisions: rows });
const result = (items, r = report()) => checkDecisionSet(items, r, { today: DAY });
const invalid = (items, code, r = report()) => {
  const checked = result(items, r);
  assert.equal(checked.ok, false);
  assert.ok(checked.problems.some(problem => problem.includes(code)), checked.problems.join('; '));
};

test('decision states do not contain approved or passed', () => {
  assert.deepEqual(DECISIONS, ['acknowledged', 'needs-source', 'deferred']);
});
test('empty decision set is a valid starting point', () => {
  assert.equal(result(emptyDecisionSet(DAY)).ok, true);
});
test('an explicit needs-source decision is valid', () => {
  assert.equal(result(decisions(decision())).ok, true);
});
test('an acknowledged finding is a human note, not a pass', () => {
  assert.equal(result(decisions(decision({ decision: 'acknowledged' }))).ok, true);
  assert.ok(!DECISIONS.includes('PASS'));
});
test('deferred decision is accepted with a reason', () => {
  assert.equal(result(decisions(decision({ decision: 'deferred' }))).ok, true);
});
test('reject decisions claiming a synthetic positive status', () => {
  invalid(decisions(decision({ decision: 'confirmed' })), 'DECISION');
});
test('reject decisions claiming auto-approved', () => {
  invalid(decisions(decision({ decision: 'auto-approved' })), 'DECISION');
});
test('reject decision without reviewer', () => {
  invalid(decisions(decision({ reviewer: '' })), 'REVIEWER');
});
test('reject reviewer containing line breaks', () => {
  invalid(decisions(decision({ reviewer: 'A\nB' })), 'REVIEWER');
});
test('reject overlong reviewer', () => {
  invalid(decisions(decision({ reviewer: 'x'.repeat(121) })), 'REVIEWER');
});
test('reject decision without a written reason', () => {
  invalid(decisions(decision({ reason: '' })), 'REASON');
});
test('reject reason containing control characters', () => {
  invalid(decisions(decision({ reason: 'a\tb' })), 'REASON');
});
test('reject overlong reason', () => {
  invalid(decisions(decision({ reason: 'x'.repeat(1001) })), 'REASON');
});
test('reject invalid reference identifier', () => {
  invalid(decisions(decision({ id: '../help' })), 'IDENTIFIER');
});
test('reject invalid code identifier', () => {
  invalid(decisions(decision({ code: 'status unknown' })), 'CODE');
});
test('reject a decision for a finding not present in the report', () => {
  invalid(decisions(decision({ code: 'INVENTED_RESULT' })), 'NO_MATCHING_FINDING');
});
test('reject duplicate decisions for the same finding', () => {
  invalid(decisions(decision(), decision({ decision: 'deferred' })), 'DUPLICATE');
});
test('different findings may have different decisions', () => {
  assert.equal(result(decisions(decision(), decision({ code: 'TIER_UNKNOWN' }))).ok, true);
});
test('decision dates must be valid calendar dates', () => {
  invalid(decisions(decision({ decidedOn: '2026-02-31' })), 'DATE');
});
test('decision dates cannot be after the audit date', () => {
  invalid(decisions(decision({ decidedOn: '2026-11-22' })), 'DATE');
});
test('decision dates cannot exceed the review snapshot date', () => {
  invalid({ ...decisions(decision({ decidedOn: DAY })), reviewedOn: '2026-11-20' }, 'DATE');
});
test('review date must be valid', () => {
  invalid({ ...decisions(), reviewedOn: '2026-12-32' }, 'DATE');
});
test('root must be a plain object', () => {
  invalid([], 'OBJECT');
  invalid(null, 'OBJECT');
});
test('root cannot contain unrecognized fields', () => {
  invalid({ ...decisions(), secret: 4 }, 'EXTRA_FIELD');
});
test('decision record must be a plain object', () => {
  invalid(decisions(null), 'OBJECT');
});
test('decision record cannot contain unrecognized fields', () => {
  invalid(decisions(decision({ inaccessible: true })), 'EXTRA_FIELD');
});
test('schemaVersion must be exactly one', () => {
  invalid({ ...decisions(), schemaVersion: 2 }, 'VERSION');
});
test('decisions must be an array', () => {
  invalid({ ...decisions(), decisions: {} }, 'ARRAY');
});
test('decisions must be bounded', () => {
  invalid({ ...decisions(), decisions: Array(801).fill(null) }, 'ARRAY');
});
test('invalid supplied today date fails closed', () => {
  assert.deepEqual(checkDecisionSet(decisions(), report(), { today: 'now' }).problems, ['today:DATE']);
});
test('an empty decision set keeps every finding unreviewed', () => {
  const result = reconcileDecisions(report(), decisions());
  assert.equal(result.ok, true);
  assert.equal(result.value.summary.unreviewed, report().findings.length);
});
test('reconciliation records acknowledged disposition', () => {
  const checked = reconcileDecisions(report(), decisions(decision({ decision: 'acknowledged' })));
  assert.equal(checked.value.summary.acknowledged, 1);
});
test('reconciliation records needs-source disposition', () => {
  const checked = reconcileDecisions(report(), decisions(decision()));
  assert.equal(checked.value.summary['needs-source'], 1);
});
test('reconciliation records deferred disposition', () => {
  const checked = reconcileDecisions(report(), decisions(decision({ decision: 'deferred' })));
  assert.equal(checked.value.summary.deferred, 1);
});
test('reconciliation does not remove unreviewed findings', () => {
  const checked = reconcileDecisions(report(), decisions(decision()));
  assert.equal(checked.value.findings.length, report().findings.length);
});
test('reconciliation retains the original finding category', () => {
  const checked = reconcileDecisions(report(), decisions(decision()));
  const row = checked.value.findings.find(item => item.code === 'STATUS_UNKNOWN');
  assert.equal(row.category, 'uncertain');
});
test('reconciliation attaches reviewer only to reviewed findings', () => {
  const checked = reconcileDecisions(report(), decisions(decision()));
  const status = checked.value.findings.find(item => item.code === 'STATUS_UNKNOWN');
  const other = checked.value.findings.find(item => item.code === 'TIER_UNKNOWN');
  assert.equal(status.reviewer, 'Fictional human reviewer');
  assert.equal(other.reviewer, null);
});
test('reconciliation attaches decision date only to reviewed findings', () => {
  const checked = reconcileDecisions(report(), decisions(decision()));
  assert.equal(checked.value.findings.find(item => item.code === 'STATUS_UNKNOWN').decidedOn, DAY);
  assert.equal(checked.value.findings.find(item => item.code === 'TIER_UNKNOWN').decidedOn, null);
});
test('unreviewed findings generate next-action review items', () => {
  const checked = reconcileDecisions(report(), decisions());
  assert.ok(requiredNextActions(checked.value).every(item => item.next === 'review'));
});
test('needs-source findings generate source-collection actions', () => {
  const checked = reconcileDecisions(report(), decisions(decision()));
  assert.ok(requiredNextActions(checked.value).some(item => item.next === 'collect-source'));
});
test('deferred findings generate follow-up actions', () => {
  const checked = reconcileDecisions(report(), decisions(decision({ decision: 'deferred' })));
  assert.ok(requiredNextActions(checked.value).some(item => item.next === 'follow-up'));
});
test('acknowledged findings do not generate further automatic action', () => {
  const checked = reconcileDecisions(report(), decisions(decision({ decision: 'acknowledged' })));
  assert.ok(!requiredNextActions(checked.value).some(item => item.code === 'STATUS_UNKNOWN'));
});
test('next actions contain no emails, URLs or scheduled dates', () => {
  const checked = reconcileDecisions(report(), decisions());
  for (const action of requiredNextActions(checked.value)) assert.deepEqual(Object.keys(action), ['id', 'code', 'next']);
});
test('missing reconciled report produces no next actions', () => {
  assert.deepEqual(requiredNextActions(null), []);
});
test('empty decision constructor refuses invalid dates', () => {
  assert.throws(() => emptyDecisionSet('tomorrow'), /DATE/);
});
test('a paired report permits different decision entries for two languages', () => {
  const pairedReport = reviewReferences(pair(), { today: DAY }).value;
  const rows = decisions(decision(), decision({ id: 'fr:fictional-guide' }));
  assert.equal(checkDecisionSet(rows, pairedReport).ok, true);
});
test('reconciliation rejects fabricated findings rather than dropping them', () => {
  const outcome = reconcileDecisions(report(), decisions(decision({ code: 'NOT_REAL' })));
  assert.equal(outcome.ok, false);
  assert.ok(outcome.problems.some(problem => problem.includes('NO_MATCHING_FINDING')));
});

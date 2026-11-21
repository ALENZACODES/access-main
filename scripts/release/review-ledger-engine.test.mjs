import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reduceCase, replay, addEvent, createCase, addObservation, caseObservations,
  observedStatuses, caseDetail, analyzeLedger, pendingCases, timeline, canPerform, decisionAllowed
} from './review-ledger-engine.mjs';
import { validateLedger, UNKNOWN } from './review-ledger-contract.mjs';
import {
  TODAY, fixture, observation, caseRecord, event, clone, withConflict,
  openCase, waitingCase, deferredCase, closedCase, reopenedCase, multiPlaceFixture, fullReviewHistory
} from './review-ledger-fixtures.mjs';
function codes(result) { return (result.issues ?? []).map(x => x.code); }
const caseA = caseRecord();
const events = (...items) => items;

test('new case is not treated as automatically reviewed', () => {
  const state = reduceCase(caseA, events());
  assert.equal(state.state, 'new');
  assert.equal(state.decision, 'none');
  assert.equal(state.lastDate, TODAY);
  assert.deepEqual(state.transitions, []);
});
test('open action makes an explicitly open case', () => {
  const state = reduceCase(caseA, events(event()));
  assert.equal(state.state, 'open');
  assert.equal(state.decision, 'none');
  assert.equal(state.lastAction, 'open');
  assert.equal(state.issues.length, 0);
});
test('request-evidence action creates waiting state', () => {
  const state = reduceCase(caseA, events(event(), event('e2', 'request-evidence', { decision: 'needs-review' })));
  assert.equal(state.state, 'waiting');
  assert.equal(state.decision, 'needs-review');
  assert.equal(state.transitions.length, 2);
});
test('defer action records an explicitly provisional decision', () => {
  const state = reduceCase(caseA, events(event(), event('e2', 'defer', { decision: 'insufficient-evidence' })));
  assert.equal(state.state, 'deferred');
  assert.equal(state.decision, 'insufficient-evidence');
});
test('close action records a reviewed case, not an accessibility assertion', () => {
  const state = reduceCase(caseA, events(event(), event('e2', 'close', { decision: 'reviewed' })));
  assert.equal(state.state, 'closed');
  assert.equal(state.decision, 'reviewed');
  assert.notEqual(state.decision, 'accessible');
});
test('reopen action clears the previous review decision', () => {
  const state = reduceCase(caseA, events(event(), event('e2', 'close', { decision: 'reviewed' }), event('e3', 'reopen')));
  assert.equal(state.state, 'open');
  assert.equal(state.decision, 'none');
  assert.equal(state.transitions.length, 3);
});
test('full human-review workflow replays deterministically', () => {
  const history = fullReviewHistory();
  const a = reduceCase(caseA, history);
  const b = reduceCase(caseA, clone(history));
  assert.deepEqual(a, b);
  assert.equal(a.state, 'closed');
  assert.equal(a.transitions.length, 7);
});
test('close before open is rejected', () => {
  const result = reduceCase(caseA, events(event('e1', 'close', { decision: 'reviewed' })));
  assert.ok(codes(result).includes('TRANSITION_INVALID'));
  assert.equal(result.state, 'new');
});
test('reopen before close is rejected', () => {
  const result = reduceCase(caseA, events(event('e1', 'reopen')));
  assert.ok(codes(result).includes('TRANSITION_INVALID'));
});
test('double open is rejected', () => {
  const result = reduceCase(caseA, events(event(), event('e2', 'open')));
  assert.ok(codes(result).includes('TRANSITION_INVALID'));
});
test('double close is rejected', () => {
  const result = reduceCase(caseA, events(event(), event('e2', 'close', { decision: 'reviewed' }), event('e3', 'close', { decision: 'reviewed' })));
  assert.ok(codes(result).includes('TRANSITION_INVALID'));
});
test('reopen from waiting instead of closed is rejected', () => {
  const result = reduceCase(caseA, events(event(), event('e2', 'request-evidence', { decision: 'needs-review' }), event('e3', 'reopen')));
  assert.ok(codes(result).includes('TRANSITION_INVALID'));
});
test('request-evidence requires needs-review decision', () => {
  const result = reduceCase(caseA, events(event(), event('e2', 'request-evidence', { decision: 'none' })));
  assert.ok(codes(result).includes('DECISION_INVALID_FOR_ACTION'));
});
test('defer requires a provisional decision', () => {
  for (const decision of ['none', 'reviewed', 'conflicting-evidence']) {
    const result = reduceCase(caseA, events(event(), event('e2', 'defer', { decision })));
    assert.ok(codes(result).includes('DECISION_INVALID_FOR_ACTION'), decision);
  }
});
test('close requires a documented non-eligibility decision', () => {
  for (const decision of ['none', 'needs-review']) {
    const result = reduceCase(caseA, events(event(), event('e2', 'close', { decision })));
    assert.ok(codes(result).includes('DECISION_INVALID_FOR_ACTION'), decision);
  }
});
test('annotation cannot silently upgrade a decision', () => {
  const result = reduceCase(caseA, events(event(), event('e2', 'annotate', { decision: 'reviewed' })));
  assert.ok(codes(result).includes('ANNOTATION_CANNOT_CHANGE_DECISION'));
  assert.equal(result.decision, 'none');
});
test('annotation with unchanged decision preserves workflow state', () => {
  const result = reduceCase(caseA, events(event(), event('e2', 'annotate')));
  assert.equal(result.state, 'open');
  assert.equal(result.decision, 'none');
  assert.equal(result.transitions.length, 2);
});
test('chronological reversals are explicitly rejected', () => {
  const older = event('e2', 'annotate', { date: '2025-11-20' });
  const result = reduceCase(caseRecord('case-a', { createdOn: '2025-11-01' }), events(event(), older));
  assert.ok(codes(result).includes('EVENT_OUT_OF_ORDER'));
  assert.equal(result.state, 'open');
});
test('replay rejects structural-invalid ledger before applying any events', () => {
  const broken = fixture({ observations: [] });
  const result = replay(broken, { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('MISSING_OBSERVATION'));
});
test('replay refuses invalid workflow history', () => {
  const invalid = fixture({ events: [event('e1', 'close', { decision: 'reviewed' })] });
  const result = replay(invalid, { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('TRANSITION_INVALID'));
});
test('replay keeps cases independent', () => {
  const data = multiPlaceFixture();
  const result = replay(data, { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.cases.length, 4);
  assert.ok(result.cases.every(x => x.state === 'open'));
});
test('addEvent returns a new ledger without mutating the original', () => {
  const original = fixture();
  const before = clone(original);
  const result = addEvent(original, event(), { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.value.events.length, 1);
  assert.deepEqual(original, before);
});
test('addEvent rejects duplicate event identifier', () => {
  const result = addEvent(openCase(), event(), { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('DUPLICATE_ID'));
});
test('addEvent rejects invalid subsequent transition', () => {
  const result = addEvent(openCase(), event('e2', 'open'), { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('TRANSITION_INVALID'));
});
test('addEvent cannot mask existing ledger errors', () => {
  const result = addEvent(fixture({ cases: [] }), event(), { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('MISSING_CASE'));
});
test('createCase refuses existing identifier', () => {
  const result = createCase(fixture(), caseRecord(), { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('DUPLICATE_ID'));
});
test('createCase accepts a second case with distinct observation', () => {
  const data = fixture({ observations: [observation(), observation('obs-b', { feature: 'parking' })] });
  const result = createCase(data, caseRecord('case-b', { feature: 'parking', observationIds: ['obs-b'] }), { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.value.cases.length, 2);
  assert.equal(data.cases.length, 1);
});
test('createCase rejects cross-place reference', () => {
  const result = createCase(fixture(), caseRecord('case-b', { placeId: 'other-place' }), { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('CROSS_PLACE_EVIDENCE'));
});
test('addObservation rejects duplicate identifier', () => {
  const result = addObservation(fixture(), observation(), { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('DUPLICATE_ID'));
});
test('addObservation accepts new sourced evidence record', () => {
  const data = fixture();
  const result = addObservation(data, observation('obs-b', { status: 'reported' }), { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.value.observations.length, 2);
  assert.equal(data.observations.length, 1);
});
test('addObservation rejects malformed provenance', () => {
  const result = addObservation(fixture(), observation('obs-b', { licence: '' }), { today: TODAY });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('LICENCE_REQUIRED'));
});
test('caseObservations respects the declared case membership', () => {
  const data = fixture({ observations: [observation(), observation('obs-b')] });
  const rows = caseObservations(data, data.cases[0]);
  assert.deepEqual(rows.map(x => x.id), ['obs-a']);
});
test('observedStatuses refuses to infer status from solely UNKNOWN evidence', () => {
  const result = observedStatuses([observation()]);
  assert.equal(result.status, UNKNOWN);
  assert.equal(result.hasConflict, false);
});
test('observedStatuses detects contradictory reported observations', () => {
  const result = observedStatuses(withConflict().observations);
  assert.equal(result.status, UNKNOWN);
  assert.equal(result.hasConflict, true);
  assert.deepEqual(result.counts, { UNKNOWN: 0, reported: 1, 'not-reported': 1 });
});
test('observedStatuses considers UNKNOWN with one reported observation without fabricating another', () => {
  const result = observedStatuses([observation(), observation('obs-b', { status: 'reported' })]);
  assert.equal(result.status, 'reported');
  assert.equal(result.counts.UNKNOWN, 1);
});
test('observedStatuses empty evidence has UNKNOWN summary', () => {
  const result = observedStatuses([]);
  assert.equal(result.status, UNKNOWN);
  assert.equal(result.counts.UNKNOWN, 0);
});
test('caseDetail reports source records and neutral state', () => {
  const data = fixture();
  const result = caseDetail(data, data.cases[0]);
  assert.equal(result.workflow.state, 'new');
  assert.equal(result.evidence[0].source, data.observations[0].source);
  assert.equal(result.statuses.status, UNKNOWN);
});
test('analyzeLedger counts open and UNKNOWN cases distinctly', () => {
  const result = analyzeLedger(openCase(), { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.totals.open, 1);
  assert.equal(result.totals.UNKNOWN, 1);
  assert.equal(result.totals.conflicting, 0);
});
test('analyzeLedger counts evidence conflict without declaring access conditions', () => {
  const result = analyzeLedger(withConflict(), { today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.totals.conflicting, 1);
  assert.equal(result.totals.UNKNOWN, 1);
});
test('analyzeLedger counts waiting, deferred and closed workflow states', () => {
  assert.equal(analyzeLedger(waitingCase(), { today: TODAY }).totals.waiting, 1);
  assert.equal(analyzeLedger(deferredCase(), { today: TODAY }).totals.deferred, 1);
  assert.equal(analyzeLedger(closedCase(), { today: TODAY }).totals.closed, 1);
});
test('pendingCases excludes closed cases and includes reopened ones', () => {
  assert.equal(pendingCases(closedCase(), { today: TODAY }).cases.length, 0);
  assert.equal(pendingCases(reopenedCase(), { today: TODAY }).cases.length, 1);
});
test('timeline contains immutable projected transitions', () => {
  const history = timeline(waitingCase(), 'case-a', { today: TODAY });
  assert.equal(history.ok, true);
  assert.deepEqual(history.events.map(x => x.action), ['open', 'request-evidence']);
  assert.equal(history.decision, 'needs-review');
});
test('timeline reports unknown case instead of guessing', () => {
  const history = timeline(fixture(), 'other-case', { today: TODAY });
  assert.equal(history.ok, false);
  assert.ok(codes(history).includes('CASE_NOT_FOUND'));
});
test('canPerform encodes safe state transitions', () => {
  assert.equal(canPerform('new', 'open'), true);
  assert.equal(canPerform('new', 'close'), false);
  assert.equal(canPerform('closed', 'reopen'), true);
  assert.equal(canPerform('closed', 'annotate'), false);
  assert.equal(canPerform('bogus', 'open'), false);
});
test('decisionAllowed rejects fabricated outcome categories', () => {
  assert.equal(decisionAllowed('close', 'accessible'), false);
  assert.equal(decisionAllowed('request-evidence', 'needs-review'), true);
  assert.equal(decisionAllowed('close', 'reviewed'), true);
  assert.equal(decisionAllowed('reopen', 'none'), true);
});
test('replay and contract agree on valid complete fixture', () => {
  const data = fixture({ events: fullReviewHistory() });
  assert.equal(validateLedger(data, { today: TODAY }).ok, true);
  assert.equal(replay(data, { today: TODAY }).ok, true);
});

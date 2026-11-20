import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RECOVERY_KINDS, REVIEW_STATES, finding, eventDigest, matchingChecks,
  recoveryForFailure, analyzeRecoveryTraces,
  coverageKeys, coverageGaps, classifyFinding, triageRecoveryTraces,
  outcomeKinds,
} from './offline-recovery-trace-analysis.mjs';
import { TODAY, document, trace, action, failure, recovery, check, source } from './offline-recovery-trace-fixtures.mjs';

const run = (steps, overrides = {}) => analyzeRecoveryTraces(document(trace('t1', { steps, ...overrides })), { today: TODAY });
const kinds = (result) => result.report.traces[0].findings.map((item) => item.code);
const full = () => [action(), failure(), recovery(), check()];

test('result vocabularies are immutable, fixed and explicit', () => {
  assert.deepEqual(REVIEW_STATES, ['PASS', 'FAIL', 'UNKNOWN']);
  assert.ok(Object.isFrozen(REVIEW_STATES));
  assert.ok(RECOVERY_KINDS.includes('unlinked-failure'));
  assert.equal(outcomeKinds('complete'), true);
  assert.equal(outcomeKinds('fabricated'), false);
});
test('findings expose codes and pointers but never personal values', () => {
  assert.deepEqual(finding('MISSING', 't1', 's1'), {
    code: 'MISSING', traceId: 't1', stepId: 's1', kind: 'review',
  });
  assert.equal(Object.isFrozen(finding('CODE', 't1')), true);
});
test('event digest reflects exact recorded event details', () => {
  const a = trace();
  const b = trace();
  assert.equal(eventDigest(a), eventDigest(b));
  b.steps[0].code = 'ANOTHER_BUTTON';
  assert.notEqual(eventDigest(a), eventDigest(b));
  assert.equal(eventDigest(a).length, 64);
});
test('event digest preserves recorded ordering', () => {
  const first = trace();
  const second = trace('b', { steps: [...full()].reverse() });
  assert.notEqual(eventDigest(first), eventDigest(second));
});
test('matching checks must follow recovery and cite its ID', () => {
  const steps = full();
  assert.deepEqual(matchingChecks(steps[2], steps).map((item) => item.id), ['c1']);
  assert.deepEqual(matchingChecks(steps[2], [check({ linkedTo: 'f1' })]), []);
});
test('recovery linkage requires later step and exact failure ID', () => {
  const steps = full();
  assert.deepEqual(recoveryForFailure(steps[1], steps).map((item) => item.id), ['r1']);
  assert.deepEqual(recoveryForFailure(steps[1], [recovery({ linkedTo: 'other' })]), []);
});
test('fully linked and checked recovery is a recorded PASS', () => {
  const result = run(full());
  assert.equal(result.ok, true);
  assert.equal(result.report.summary.PASS, 1);
  assert.equal(result.report.traces[0].state, 'PASS');
  assert.equal(result.report.traces[0].recovered, 1);
  assert.deepEqual(result.report.traces[0].findings, []);
});
test('missing recovery never becomes a pass', () => {
  const steps = [action(), failure()];
  const result = run(steps);
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
  assert.ok(kinds(result).includes('UNLINKED_FAILURE'));
  assert.equal(result.report.summary.recovered, 0);
});
test('a retry without subsequent check remains UNKNOWN', () => {
  const result = run([action(), failure(), recovery()]);
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
  assert.ok(kinds(result).includes('RECOVERY_UNKNOWN'));
  assert.equal(result.report.traces[0].recovered, 0);
});
test('an UNKNOWN check does not imply successful recovery', () => {
  const result = run([action(), failure(), recovery(), check({ outcome: 'UNKNOWN' })]);
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
  assert.ok(kinds(result).includes('RECOVERY_UNKNOWN'));
});
test('an UNKNOWN recovery stays uncertain even with PASS check', () => {
  const result = run([action(), failure(), recovery({ outcome: 'UNKNOWN' }), check()]);
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
});
test('failed recovery is a recorded failure', () => {
  const result = run([action(), failure(), recovery({ outcome: 'FAIL' }), check()]);
  assert.equal(result.report.traces[0].state, 'FAIL');
  assert.equal(result.report.summary.FAIL, 1);
  assert.ok(kinds(result).includes('RECOVERY_FAILED'));
});
test('failed post-recovery check is a recorded failure', () => {
  const result = run([action(), failure(), recovery(), check({ outcome: 'FAIL' })]);
  assert.equal(result.report.traces[0].state, 'FAIL');
  assert.ok(kinds(result).includes('RECOVERY_FAILED'));
});
test('unlinked recovery is flagged even if it reports PASS', () => {
  const result = run([action(), failure(), recovery({ linkedTo: 'a1' }), check()]);
  assert.equal(result.ok, true);
  assert.ok(kinds(result).includes('UNLINKED_RECOVERY'));
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
});
test('a check without a recovery is independently flagged', () => {
  const result = run([action(), failure(), check({ linkedTo: 'f1' })]);
  assert.ok(kinds(result).includes('UNLINKED_CHECK'));
  assert.ok(kinds(result).includes('UNLINKED_FAILURE'));
});
test('no captured failure cannot establish recovery', () => {
  const result = run([action()]);
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
  assert.ok(kinds(result).includes('NO_FAILURE_CAPTURE'));
});
test('no captured action is separately identified', () => {
  const result = run([failure({ at: 1 }), recovery({ at: 2 }), check({ at: 3 })]);
  assert.ok(kinds(result).includes('NO_ACTION_CAPTURE'));
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
});
test('empty trace needs review rather than pass', () => {
  const result = run([]);
  assert.equal(result.ok, true);
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
  assert.equal(result.report.traces[0].events, 0);
  assert.equal(result.report.traces[0].findings.length, 2);
});
test('one failed check among many prevents a PASS', () => {
  const steps = [...full(), check({ id: 'c2', at: 5, outcome: 'FAIL' })];
  const result = run(steps);
  assert.equal(result.report.traces[0].state, 'FAIL');
});
test('two successful failures can both be recovered', () => {
  const steps = [...full(), failure({ id: 'f2', at: 5, code: 'SECOND_FAILURE' }),
    recovery({ id: 'r2', at: 6, linkedTo: 'f2' }),
    check({ id: 'c2', at: 7, linkedTo: 'r2' })];
  const result = run(steps);
  assert.equal(result.report.traces[0].state, 'PASS');
  assert.equal(result.report.traces[0].recovered, 2);
  assert.equal(result.report.summary.failures, 2);
});
test('mixed successful and uncertain recoveries remain UNKNOWN', () => {
  const steps = [...full(), failure({ id: 'f2', at: 5, code: 'SECOND_FAILURE' }),
    recovery({ id: 'r2', at: 6, linkedTo: 'f2' })];
  const result = run(steps);
  assert.equal(result.report.traces[0].state, 'UNKNOWN');
  assert.equal(result.report.traces[0].recovered, 1);
});
test('replayed outcomes include provenance without rewriting it', () => {
  const src = source();
  const result = run(full(), { source: src });
  assert.deepEqual(result.report.traces[0].source, src);
  assert.equal(result.report.traces[0].source.tier, 0);
});
test('invalid input fails closed with no partial report', () => {
  const result = analyzeRecoveryTraces({ traces: [{}] });
  assert.equal(result.ok, false);
  assert.equal(result.report, null);
  assert.ok(result.problems.length > 0);
});
test('multiple traces have deterministic ordering and statistics', () => {
  const value = document(trace('z'), trace('a', { steps: [action(), failure()] }));
  const result = analyzeRecoveryTraces(value);
  assert.deepEqual(result.report.traces.map((entry) => entry.id), ['a', 'z']);
  assert.equal(result.report.summary.PASS, 1);
  assert.equal(result.report.summary.UNKNOWN, 1);
  assert.equal(result.report.summary.traces, 2);
});
test('coverage keys are ordered and unique', () => {
  const traces = [trace('one'), trace('two'), trace('three', { locale: 'fr' })];
  assert.deepEqual(coverageKeys(traces), ['en|offline|navigation', 'fr|offline|navigation']);
});
test('missing French evidence yields UNKNOWN gap', () => {
  const result = coverageGaps(document(), { locales: ['en', 'fr'], modes: ['offline'],
    categories: ['navigation'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.gaps, [{ locale: 'fr', mode: 'offline', category: 'navigation',
    state: 'UNKNOWN', reason: 'MISSING_TRACE' }]);
});
test('a recorded FAIL produces a nonpassing coverage gap', () => {
  const value = document(trace('bad', { steps: [action(), failure(), recovery({ outcome: 'FAIL' }), check()] }));
  const result = coverageGaps(value, { locales: ['en'], modes: ['offline'], categories: ['navigation'] });
  assert.equal(result.gaps[0].state, 'FAIL');
  assert.equal(result.gaps[0].reason, 'NO_PASSING_TRACE');
});
test('an UNKNOWN replay does not fill coverage', () => {
  const value = document(trace('not-checked', { steps: [action(), failure()] }));
  const result = coverageGaps(value, { locales: ['en'], modes: ['offline'], categories: ['navigation'] });
  assert.equal(result.gaps[0].state, 'UNKNOWN');
});
test('a complete replay fills its one matching coverage cell', () => {
  const result = coverageGaps(document(), { locales: ['en'], modes: ['offline'],
    categories: ['navigation'] });
  assert.equal(result.summary.expected, 1);
  assert.equal(result.gaps.length, 0);
});
test('coverage never turns an empty input into success', () => {
  const value = { ...document(), traces: [] };
  const result = coverageGaps(value, { locales: ['en'], modes: ['offline'], categories: ['navigation'] });
  assert.equal(result.gaps[0].state, 'UNKNOWN');
});
test('coverage rejects unsupported categories or languages', () => {
  assert.equal(coverageGaps(document(), { locales: ['es'] }).ok, false);
  assert.equal(coverageGaps(document(), { modes: ['not-a-mode'] }).ok, false);
  assert.equal(coverageGaps(document(), { categories: ['inference'] }).ok, false);
});
test('coverage includes all required categories by default', () => {
  const result = coverageGaps(document());
  assert.ok(result.summary.expected >= 20);
  assert.ok(result.gaps.some((gap) => gap.category === 'keyboard'));
  assert.ok(result.gaps.some((gap) => gap.category === 'touch-target'));
});
test('finding severity prioritizes recorded recovery failures', () => {
  assert.equal(classifyFinding({ code: 'RECOVERY_FAILED' }), 'block');
  assert.equal(classifyFinding({ code: 'UNLINKED_CHECK' }), 'review');
  assert.equal(classifyFinding({ code: 'NO_FAILURE_CAPTURE' }), 'information');
});
test('triage tasks are deterministic and contain source metadata', () => {
  const input = document(trace('b', { steps: [action(), failure()] }),
    trace('a', { steps: [action(), failure(), recovery({ outcome: 'FAIL' }), check()] }));
  const result = triageRecoveryTraces(input);
  assert.equal(result.ok, true);
  assert.equal(result.tasks[0].severity, 'block');
  assert.equal(result.tasks[0].source.licence, 'CC0-1.0');
});
test('triage does not make up tasks for fully checked trace', () => {
  const result = triageRecoveryTraces(document());
  assert.deepEqual(result.tasks, []);
});
test('triage rejects invalid document rather than summarizing partial evidence', () => {
  const result = triageRecoveryTraces({ version: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.tasks, null);
});
test('analyzed source data is never modified', () => {
  const input = document(trace('a'));
  const json = JSON.stringify(input);
  analyzeRecoveryTraces(input);
  triageRecoveryTraces(input);
  coverageGaps(input);
  assert.equal(JSON.stringify(input), json);
});

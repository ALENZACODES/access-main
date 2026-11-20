import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REPLAY_ISSUES, replayFinding, channelEvent, stateFromFindings,
  replayStep, replayJourney, replayTrace, compareReplays, severityScore, stateValid,
} from './assistive-trace-replay.mjs';
import { TODAY, event, step, journey, trace, clone } from './assistive-trace-fixtures.mjs';

const options = { today: TODAY };
const codes = (stepValue) => replayStep(stepValue, '/step').findings.map((item) => item.code);
const records = (channel, events, expected = 'PASS') => step(channel, { events, expected });
const start = () => event('step-start', 'start', 0);
const end = (at = 4) => event('step-end', 'end', at);

test('replay vocabulary captures missing observation classes', () => {
  assert.ok(REPLAY_ISSUES.includes('FOCUS_MISSING'));
  assert.ok(REPLAY_ISSUES.includes('ANNOUNCEMENT_MISSING'));
  assert.ok(REPLAY_ISSUES.includes('STATE_UNKNOWN'));
  assert.equal(new Set(REPLAY_ISSUES).size, REPLAY_ISSUES.length);
});
test('findings contain only codes, paths and severity', () => {
  assert.deepEqual(replayFinding('KEY_MISSING', '/journey'), {
    code: 'KEY_MISSING', path: '/journey', severity: 'review',
  });
  assert.equal(replayFinding('FAIL', '/', 'error').severity, 'error');
});
test('each channel has one primary recorded interaction type', () => {
  assert.equal(channelEvent('keyboard'), 'key');
  assert.equal(channelEvent('focus'), 'focus');
  assert.equal(channelEvent('announcement'), 'announce');
  assert.equal(channelEvent('offline'), 'asset');
  assert.equal(channelEvent('storage'), 'storage');
  assert.equal(channelEvent('other'), null);
});
test('no findings means recorded pass', () => {
  assert.equal(stateFromFindings([]), 'PASS');
});
test('review findings make outcome unknown', () => {
  assert.equal(stateFromFindings([replayFinding('KEY_MISSING', '/x')]), 'UNKNOWN');
});
test('error takes priority over missing evidence', () => {
  assert.equal(stateFromFindings([replayFinding('KEY_MISSING', '/x'), replayFinding('RECORDED_FAILURE', '/x', 'error')]), 'FAIL');
});
test('baseline synthetic keyboard observation has no findings', () => {
  const result = replayStep(step(), '/s');
  assert.deepEqual(result.findings, []);
  assert.equal(result.state, 'PASS');
  assert.equal(result.events, 3);
});
test('step with no events reports missing start, end and primary event', () => {
  const found = codes(records('keyboard', []));
  assert.ok(found.includes('STEP_START_MISSING'));
  assert.ok(found.includes('STEP_END_MISSING'));
  assert.ok(found.includes('KEY_MISSING'));
});
test('step start alone does not imply completion', () => {
  assert.ok(codes(records('keyboard', [start(), event('key', 'key', 1)])).includes('STEP_END_MISSING'));
});
test('step end alone does not imply activation', () => {
  const found = codes(records('keyboard', [end()]));
  assert.ok(found.includes('STEP_START_MISSING'));
  assert.ok(found.includes('KEY_MISSING'));
});
test('two starts are an explicit failure', () => {
  const found = replayStep(records('keyboard', [start(), event('step-start', 'start-b', 1), event('key', 'key', 2), end()]), '/s');
  assert.equal(found.state, 'FAIL');
  assert.ok(found.findings.some((item) => item.code === 'DUPLICATE_START'));
});
test('two ends are an explicit failure', () => {
  const found = replayStep(records('keyboard', [start(), event('key', 'key', 1), end(), event('step-end', 'end-b', 5)]), '/s');
  assert.equal(found.state, 'FAIL');
  assert.ok(found.findings.some((item) => item.code === 'DUPLICATE_END'));
});
test('end before start produces error', () => {
  const found = codes(records('keyboard', [event('step-end', 'end', 0), event('key', 'key', 1), event('step-start', 'start', 2)]));
  assert.ok(found.includes('STEP_END_EARLY'));
});
test('late start is not accepted as a complete trace', () => {
  const found = codes(records('keyboard', [event('key', 'key', 0), event('step-start', 'start', 1), end()]));
  assert.ok(found.includes('STEP_START_LATE'));
});
test('ending before last event reports out-of-order evidence', () => {
  const found = codes(records('keyboard', [start(), end(1), event('key', 'key', 2)]));
  assert.ok(found.includes('EVENT_OUT_OF_ORDER'));
});
test('focus channel requires a recorded focus event', () => {
  const found = codes(records('focus', [start(), event('key', 'key', 1), end()]));
  assert.ok(found.includes('FOCUS_MISSING'));
});
test('focus channel with matching event accepts observed trace', () => {
  const result = replayStep(records('focus', [start(), event('focus', 'focus', 1), end()]), '/s');
  assert.equal(result.state, 'PASS');
});
test('announcement channel must record spoken or live-region text', () => {
  const found = codes(records('announcement', [start(), event('focus', 'focus', 1), end()]));
  assert.ok(found.includes('ANNOUNCEMENT_MISSING'));
});
test('announcement channel accepts bilingual captured message', () => {
  const result = replayStep(records('announcement', [start(), event('announce', 'notice', 1), end()]), '/s');
  assert.equal(result.state, 'PASS');
});
test('offline channel cannot use an unrecorded asset claim', () => {
  const found = codes(records('offline', [start(), event('key', 'key', 1), end()]));
  assert.ok(found.includes('ASSET_MISSING'));
});
test('offline channel accepts captured asset observation', () => {
  const result = replayStep(records('offline', [start(), event('asset', 'asset', 1), end()]), '/s');
  assert.equal(result.state, 'PASS');
});
test('storage channel cannot infer success from a key press', () => {
  const found = codes(records('storage', [start(), event('key', 'key', 1), end()]));
  assert.ok(found.includes('STORAGE_MISSING'));
});
test('storage channel accepts explicit local-storage observation', () => {
  const result = replayStep(records('storage', [start(), event('storage', 'storage', 1), end()]), '/s');
  assert.equal(result.state, 'PASS');
});
test('recorded failing event produces failing step', () => {
  const failed = step('keyboard'); failed.events[1].state = 'FAIL';
  assert.equal(replayStep(failed, '/s').state, 'FAIL');
  assert.ok(codes(failed).includes('RECORDED_FAILURE'));
});
test('unknown event never silently becomes a pass', () => {
  const unknown = step('keyboard'); unknown.events[1].state = 'UNKNOWN';
  assert.equal(replayStep(unknown, '/s').state, 'UNKNOWN');
  assert.ok(codes(unknown).includes('STATE_UNKNOWN'));
});
test('unknown end outcome is reviewable not complete', () => {
  const unknown = step(); unknown.events.at(-1).outcome = 'UNKNOWN';
  assert.equal(replayStep(unknown, '/s').state, 'UNKNOWN');
});
test('incomplete end outcome produces failure', () => {
  const incomplete = step(); incomplete.events.at(-1).outcome = 'incomplete';
  assert.equal(replayStep(incomplete, '/s').state, 'FAIL');
});
test('expected PASS disagrees with missing recorded evidence', () => {
  const result = replayStep(records('focus', [start(), end()]), '/s');
  assert.ok(result.findings.some((finding) => finding.code === 'OBSERVED_DISAGREEMENT'));
});
test('expected UNKNOWN remains UNKNOWN when nothing was recorded', () => {
  const result = replayStep(records('focus', [], 'UNKNOWN'), '/s');
  assert.equal(result.state, 'UNKNOWN');
  assert.ok(!result.findings.some((finding) => finding.code === 'OBSERVED_DISAGREEMENT'));
});
test('keyboard focus observed before activation needs review', () => {
  const value = records('keyboard', [start(), event('focus', 'focus', 1), event('key', 'key', 2), end()]);
  assert.ok(codes(value).includes('FOCUS_BEFORE_KEY'));
});
test('announcement before focus needs review', () => {
  const value = records('announcement', [start(), event('announce', 'notice', 1), event('focus', 'focus', 2), end()]);
  assert.ok(codes(value).includes('ANNOUNCEMENT_BEFORE_FOCUS'));
});
test('regular focus then announcement sequence has no timing warning', () => {
  const value = records('announcement', [start(), event('focus', 'focus', 1), event('announce', 'notice', 2), end()]);
  assert.equal(replayStep(value, '/s').state, 'PASS');
});
test('replay produces stable deterministic finding order', () => {
  const result = replayStep(records('focus', []), '/s');
  assert.deepEqual(result.findings.map((f) => f.code), [...result.findings.map((f) => f.code)].sort());
});
test('journey aggregates step states conservatively', () => {
  const first = step(); const second = step('focus', { id: 'step-b', events: [] });
  const result = replayJourney(journey('j', { steps: [first, second] }), '/j');
  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.steps.length, 2);
});
test('journey result retains locale and network', () => {
  const result = replayJourney(journey('j', { locale: 'fr', network: 'limited' }), '/j');
  assert.equal(result.locale, 'fr');
  assert.equal(result.network, 'limited');
});
test('invalid source metadata blocks the entire replay', () => {
  const value = trace(); delete value.sources[0].licence;
  const result = replayTrace(value, options);
  assert.equal(result.ok, false);
  assert.equal(result.result, null);
});
test('replay handles empty journey collection as UNKNOWN', () => {
  const value = trace(); value.journeys = [];
  const result = replayTrace(value, options);
  assert.equal(result.ok, true);
  assert.equal(result.result.status, 'UNKNOWN');
});
test('replay reports exact PASS and UNKNOWN counts', () => {
  const failing = journey('j-b', { steps: [step('focus', { events: [] })] });
  const result = replayTrace(trace(journey('j-a'), failing), options);
  assert.equal(result.result.counts.PASS, 1);
  assert.equal(result.result.counts.UNKNOWN, 1);
  assert.equal(result.result.stepCounts.PASS, 1);
  assert.equal(result.result.stepCounts.UNKNOWN, 1);
});
test('replay does not mutate input records', () => {
  const original = trace(); const before = JSON.stringify(original);
  replayTrace(original, options);
  assert.equal(JSON.stringify(original), before);
});
test('compare identical traces returns no changes', () => {
  const data = trace();
  assert.deepEqual(compareReplays(data, clone(data), options).changes, []);
});
test('compare added journey reports added and UNKNOWN before state', () => {
  const a = trace(); const b = trace(journey(), journey('another'));
  const result = compareReplays(a, b, options);
  assert.ok(result.changes.some((change) => change.id === 'another' && change.before === 'UNKNOWN'));
});
test('compare removed journey preserves UNKNOWN afterward', () => {
  const a = trace(journey(), journey('another')); const b = trace();
  const result = compareReplays(a, b, options);
  assert.ok(result.changes.some((change) => change.kind === 'removed' && change.after === 'UNKNOWN'));
});
test('compare state transition is explicit', () => {
  const a = trace(); const b = clone(a); b.journeys[0].steps[0].events[1].state = 'UNKNOWN';
  const result = compareReplays(a, b, options);
  assert.deepEqual(result.changes.map((change) => change.kind), ['state-changed']);
});
test('compare equal state with changed event needs review', () => {
  const a = trace(); const b = clone(a); b.journeys[0].steps[0].events[1].key = 'Enter';
  const result = compareReplays(a, b, options);
  assert.deepEqual(result.changes.map((change) => change.kind), ['evidence-changed']);
});
test('compare invalid earlier trace fails closed', () => {
  const bad = trace(); bad.sources[0].licence = 'closed';
  const result = compareReplays(bad, trace(), options);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(({ snapshot }) => snapshot === 'earlier'));
});
test('compare invalid later trace fails closed', () => {
  const bad = trace(); bad.journeys[0].steps[0].expected = 'true';
  const result = compareReplays(trace(), bad, options);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(({ snapshot }) => snapshot === 'later'));
});
test('severity ranking respects explicit error and review', () => {
  assert.equal(severityScore('error'), 3);
  assert.equal(severityScore('review'), 2);
  assert.equal(severityScore('information'), 1);
  assert.equal(severityScore('unknown'), 0);
});
test('replay state vocabulary excludes booleans', () => {
  assert.equal(stateValid('UNKNOWN'), true);
  assert.equal(stateValid('PASS'), true);
  assert.equal(stateValid(true), false);
  assert.equal(stateValid('yes'), false);
});

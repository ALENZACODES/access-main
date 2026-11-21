import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COVERAGE_DIMENSIONS, emptyCoverage, coverageCells, coverageGaps,
  coverageSummary, compareCoverage, traceWorklist,
} from './assistive-trace-coverage.mjs';
import { TODAY, trace, journey, step, event, clone } from './assistive-trace-fixtures.mjs';

const options = { today: TODAY };
const cells = (data) => coverageCells(data, options).cells;
const summary = (data) => coverageSummary(data, options);
const gaps = (data) => coverageGaps(data, options).gaps;
const choose = (data, locale, network, channel) => cells(data).find((cell) =>
  cell.locale === locale && cell.network === network && cell.channel === channel);
const observed = (channel) => ({
  keyboard: event('key', 'key', 1), focus: event('focus', 'focus', 1),
  announcement: event('announce', 'announcement', 1),
  offline: event('asset', 'asset', 1), storage: event('storage', 'storage', 1),
})[channel];
const recordedStep = (channel, id = `step-${channel}`) => {
  const records = [event('step-start', `start-${id}`, 0), observed(channel), event('step-end', `end-${id}`, 3)];
  return step(channel, { id, events: records.map((e) => ({ ...e, stepId: id })) });
};

test('coverage dimensions explicitly include English and French', () => {
  assert.deepEqual(COVERAGE_DIMENSIONS.locales, ['en', 'fr']);
});
test('coverage includes offline, online and limited-network conditions', () => {
  assert.deepEqual(COVERAGE_DIMENSIONS.networks, ['offline', 'online', 'limited']);
});
test('coverage includes all five assistive interaction channels', () => {
  assert.deepEqual(COVERAGE_DIMENSIONS.channels, ['keyboard', 'focus', 'announcement', 'offline', 'storage']);
});
test('default coverage counts are zero and never treated as passes', () => {
  assert.deepEqual(emptyCoverage(), { total: 0, PASS: 0, FAIL: 0, UNKNOWN: 0 });
});
test('coverage always emits full 2 x 3 x 5 matrix', () => {
  assert.equal(cells(trace()).length, 30);
});
test('unrecorded cells are explicitly UNKNOWN', () => {
  const cell = choose(trace(), 'fr', 'online', 'announcement');
  assert.equal(cell.state, 'UNKNOWN');
  assert.equal(cell.counts.total, 0);
});
test('recorded English keyboard event is a pass in its cell', () => {
  const cell = choose(trace(), 'en', 'offline', 'keyboard');
  assert.equal(cell.state, 'PASS');
  assert.equal(cell.counts.total, 1);
});
test('recorded PASS cell does not affect missing French cell', () => {
  assert.equal(choose(trace(), 'fr', 'offline', 'keyboard').state, 'UNKNOWN');
});
test('empty journey list produces only UNKNOWN cells', () => {
  const data = trace(); data.journeys = [];
  assert.ok(cells(data).every((cell) => cell.state === 'UNKNOWN'));
});
test('empty journeys produce 30 explicit coverage gaps', () => {
  const data = trace(); data.journeys = [];
  assert.equal(gaps(data).length, 30);
});
test('missing evidence has MISSING_TRACE reason', () => {
  const gap = gaps(trace()).find((item) => item.locale === 'fr' && item.channel === 'focus');
  assert.equal(gap.reason, 'MISSING_TRACE');
});
test('recorded uncertain observation has RECORDED_GAP reason', () => {
  const data = trace(); data.journeys[0].steps[0].events[1].state = 'UNKNOWN';
  const gap = gaps(data).find((item) => item.locale === 'en' && item.channel === 'keyboard');
  assert.equal(gap.reason, 'RECORDED_GAP');
  assert.equal(gap.state, 'UNKNOWN');
});
test('recorded failure takes priority over pass in the same cell', () => {
  const failed = recordedStep('keyboard', 'step-b'); failed.events[1].state = 'FAIL';
  const data = trace(journey('j-a', { steps: [step(), failed] }));
  const cell = choose(data, 'en', 'offline', 'keyboard');
  assert.equal(cell.state, 'FAIL');
  assert.equal(cell.counts.total, 2);
  assert.equal(cell.counts.FAIL, 1);
});
test('recorded unknown takes priority over pass in the same cell', () => {
  const unknown = recordedStep('keyboard', 'step-b'); unknown.events[1].state = 'UNKNOWN';
  const data = trace(journey('j-a', { steps: [step(), unknown] }));
  assert.equal(choose(data, 'en', 'offline', 'keyboard').state, 'UNKNOWN');
});
test('invalid provenance prevents any coverage matrix', () => {
  const data = trace(); data.sources[0].url = 'file:///secret';
  const result = coverageCells(data, options);
  assert.equal(result.ok, false);
  assert.equal(result.cells, null);
});
test('invalid event time prevents generating gaps', () => {
  const data = trace(); data.journeys[0].steps[0].events[0].at = -1;
  const result = coverageGaps(data, options);
  assert.equal(result.ok, false);
  assert.equal(result.gaps, null);
});
test('baseline has one PASS and 29 UNKNOWN coverage cells', () => {
  const result = summary(trace());
  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, { total: 30, PASS: 1, FAIL: 0, UNKNOWN: 29 });
});
test('coverage summary never claims success for an empty matrix', () => {
  const data = trace(); data.journeys = [];
  assert.equal(summary(data).summary.PASS, 0);
  assert.equal(summary(data).summary.UNKNOWN, 30);
});
test('all five channels may be recorded without changing other networks', () => {
  const steps = COVERAGE_DIMENSIONS.channels.map((channel) => recordedStep(channel));
  const data = trace(journey('all', { steps }));
  assert.equal(summary(data).summary.PASS, 5);
  assert.equal(summary(data).summary.UNKNOWN, 25);
});
test('French journey is distinct from English journey', () => {
  const data = trace(journey('en'), journey('fr', { locale: 'fr' }));
  assert.equal(choose(data, 'en', 'offline', 'keyboard').state, 'PASS');
  assert.equal(choose(data, 'fr', 'offline', 'keyboard').state, 'PASS');
});
test('online evidence never counts as offline evidence', () => {
  const data = trace(journey('on', { network: 'online' }));
  assert.equal(choose(data, 'en', 'online', 'keyboard').state, 'PASS');
  assert.equal(choose(data, 'en', 'offline', 'keyboard').state, 'UNKNOWN');
});
test('limited-network evidence is tracked separately from offline', () => {
  const data = trace(journey('limited', { network: 'limited' }));
  assert.equal(choose(data, 'en', 'limited', 'keyboard').state, 'PASS');
  assert.equal(choose(data, 'en', 'offline', 'keyboard').state, 'UNKNOWN');
});
test('coverage worklist includes only gaps', () => {
  const tasks = traceWorklist(trace(), options).tasks;
  assert.equal(tasks.length, 29);
  assert.ok(tasks.every((task) => task.status === 'UNKNOWN'));
});
test('worklist IDs are stable, unique and predictable', () => {
  const tasks = traceWorklist(trace(), options).tasks;
  assert.equal(tasks[0].id, 'review-001');
  assert.equal(tasks.at(-1).id, 'review-029');
  assert.equal(new Set(tasks.map((task) => task.id)).size, tasks.length);
});
test('worklist never contains actual source names or private data', () => {
  const tasks = traceWorklist(trace(), options).tasks;
  assert.equal(JSON.stringify(tasks).includes('example.org'), false);
});
test('worklist is deterministic across input journey order', () => {
  const a = trace(journey('z'), journey('a', { locale: 'fr' }));
  const b = clone(a); b.journeys.reverse();
  assert.deepEqual(traceWorklist(a, options), traceWorklist(b, options));
});
test('no changes means empty coverage comparison', () => {
  const a = trace();
  assert.deepEqual(compareCoverage(a, clone(a), options).changes, []);
});
test('new French evidence changes exactly one cell', () => {
  const a = trace(); const b = trace(journey('en'), journey('fr', { locale: 'fr' }));
  const comparison = compareCoverage(a, b, options);
  assert.equal(comparison.changes.length, 1);
  assert.equal(comparison.changes[0].locale, 'fr');
  assert.equal(comparison.changes[0].after, 'PASS');
});
test('withdrawn journey changes its cell to UNKNOWN', () => {
  const a = trace(); const b = trace(); b.journeys = [];
  const comparison = compareCoverage(a, b, options);
  assert.equal(comparison.changes[0].before, 'PASS');
  assert.equal(comparison.changes[0].after, 'UNKNOWN');
});
test('more observations with same state still report changed coverage count', () => {
  const a = trace(); const b = trace(journey('a'), journey('b'));
  const comparison = compareCoverage(a, b, options);
  assert.equal(comparison.changes.length, 1);
  assert.equal(comparison.changes[0].beforeCount, 1);
  assert.equal(comparison.changes[0].afterCount, 2);
});
test('invalid earlier version prevents comparison', () => {
  const a = trace(); a.version = 2;
  const comparison = compareCoverage(a, trace(), options);
  assert.equal(comparison.ok, false);
  assert.ok(comparison.problems.some((problem) => problem.snapshot === 'before'));
});
test('invalid later version prevents comparison', () => {
  const b = trace(); b.journeys[0].steps[0].expected = true;
  const comparison = compareCoverage(trace(), b, options);
  assert.equal(comparison.ok, false);
  assert.ok(comparison.problems.some((problem) => problem.snapshot === 'after'));
});
test('coverage cells preserve a numeric count separate from its outcome', () => {
  for (const cell of cells(trace())) {
    assert.equal(typeof cell.counts.total, 'number');
    assert.ok(['PASS', 'FAIL', 'UNKNOWN'].includes(cell.state));
  }
});
test('all coverage failures retain a manual-review reason', () => {
  const data = trace(); data.journeys[0].steps[0].events[1].state = 'FAIL';
  assert.ok(gaps(data).some((gap) => gap.state === 'FAIL' && gap.reason === 'RECORDED_GAP'));
});
test('source claim cannot upgrade missing coverage from UNKNOWN', () => {
  const data = trace(); data.sources[0].tier = 4;
  assert.equal(choose(data, 'fr', 'offline', 'announcement').state, 'UNKNOWN');
});

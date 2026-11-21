import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLANNER_VERSION, PLAN_DIMENSIONS, viewportBand, requiredCells,
  captureCell, scenarioCoverage, missingScenarioTasks, reviewPlan,
  compactGateSummary, blankDrill,
} from './offline-drill-planner.mjs';
import { capture, control, document } from './offline-drill-fixtures.mjs';

const narrow = { routes: ['/synthetic'], dimensions: { networks: ['offline'],
  storage: ['ready'], locales: ['en'], sizes: ['narrow'] } };
const withCapture = (override = {}) => document(capture('a', override));

test('planner owns a versioned contract and bounded dimensions', () => {
  assert.equal(PLANNER_VERSION, 1);
  assert.deepEqual(PLAN_DIMENSIONS.locales, ['en', 'fr']);
  assert.deepEqual(PLAN_DIMENSIONS.networks, ['offline', 'limited', 'online']);
  assert.deepEqual(PLAN_DIMENSIONS.storage, ['ready', 'blocked']);
  assert.equal(PLAN_DIMENSIONS.sizes.length, 3);
});
test('viewport band maps the narrow boundary', () => {
  assert.equal(viewportBand(240), 'narrow');
  assert.equal(viewportBand(390), 'narrow');
  assert.equal(viewportBand(479), 'narrow');
});
test('viewport band maps medium and wide boundaries', () => {
  assert.equal(viewportBand(480), 'medium');
  assert.equal(viewportBand(1023), 'medium');
  assert.equal(viewportBand(1024), 'wide');
  assert.equal(viewportBand(8192), 'wide');
});
test('viewport band does not guess when width is invalid', () => {
  for (const value of [-1, 0, 239, 8193, 390.5, undefined, NaN, Infinity]) {
    assert.equal(viewportBand(value), 'UNKNOWN', String(value));
  }
});
test('required combinations are distinct and reproducible', () => {
  const cells = requiredCells(['/synthetic'], narrow.dimensions);
  assert.deepEqual(cells, ['/synthetic|en|offline|ready|narrow']);
});
test('two locales create independent coverage requirements', () => {
  const cells = requiredCells(['/synthetic'], { ...narrow.dimensions, locales: ['en', 'fr'] });
  assert.equal(cells.length, 2);
  assert.ok(cells.some((id) => id.includes('|en|')));
  assert.ok(cells.some((id) => id.includes('|fr|')));
});
test('storage blocked and ready are distinct scenarios', () => {
  const cells = requiredCells(['/synthetic'], { ...narrow.dimensions,
    storage: ['ready', 'blocked'] });
  assert.equal(cells.length, 2);
  assert.ok(cells.some((id) => id.includes('|blocked|')));
});
test('required cells reject invalid route shapes and separators', () => {
  for (const routes of [['relative'], ['/one|two'], [null], ['x'.repeat(900)], null]) {
    assert.equal(requiredCells(routes, narrow.dimensions), null);
  }
});
test('required cells reject unsupported scenario values', () => {
  assert.equal(requiredCells(['/a'], { ...narrow.dimensions, networks: ['wireless'] }), null);
  assert.equal(requiredCells(['/a'], { ...narrow.dimensions, locales: ['de'] }), null);
  assert.equal(requiredCells(['/a'], { ...narrow.dimensions, sizes: ['tiny'] }), null);
  assert.equal(requiredCells(['/a'], { ...narrow.dimensions, storage: [] }), null);
});
test('required cells have a capacity bound to avoid huge planning output', () => {
  const routes = Array.from({ length: 300 }, (_, i) => `/route-${i}`);
  assert.equal(requiredCells(routes), null);
});
test('duplicate route inputs do not duplicate required cells', () => {
  const cells = requiredCells(['/synthetic', '/synthetic'], narrow.dimensions);
  assert.equal(cells.length, 1);
});
test('capture cell preserves route and operational dimensions', () => {
  assert.equal(captureCell(capture()), '/synthetic|en|offline|ready|narrow');
});
test('capture cell refuses missing viewport without guessing', () => {
  assert.equal(captureCell(null), null);
  assert.equal(captureCell({ route: '/a' }), null);
});
test('baseline coverage meets a single exact scenario', () => {
  const result = scenarioCoverage(document(), narrow);
  assert.equal(result.ok, true);
  assert.equal(result.summary.required, 1);
  assert.equal(result.summary.observed, 1);
  assert.equal(result.summary.missing, 0);
  assert.equal(result.summary.status, 'PASS');
});
test('missing French observation is explicitly UNKNOWN', () => {
  const options = { ...narrow, dimensions: { ...narrow.dimensions, locales: ['en', 'fr'] } };
  const result = scenarioCoverage(document(), options);
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.status, 'UNKNOWN');
  assert.ok(result.missing[0].includes('|fr|'));
});
test('missing offline capture cannot be inferred from online capture', () => {
  const input = withCapture({ network: 'online' });
  const result = scenarioCoverage(input, narrow);
  assert.equal(result.summary.observed, 0);
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.extra, 1);
});
test('extra network captures are reported, not discarded', () => {
  const input = document(capture('a'), capture('b', { network: 'online' }));
  const result = scenarioCoverage(input, narrow);
  assert.equal(result.extra.length, 1);
  assert.ok(result.extra[0].includes('|online|'));
});
test('repeated observations are separately counted', () => {
  const input = document(capture('a'), capture('b'));
  const result = scenarioCoverage(input, narrow);
  assert.equal(result.summary.repeated, 1);
  assert.equal(result.present[0].captures, 2);
});
test('invalid document cannot obtain coverage summary', () => {
  const input = document();
  input.captures[0].shell = true;
  const result = scenarioCoverage(input, narrow);
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.deepEqual(result.missing, []);
});
test('invalid route scope fails without guessing', () => {
  const result = scenarioCoverage(document(), { routes: ['bad'] });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.code === 'PLAN_SCOPE'));
});
test('default full coverage matrix requires all dimensions', () => {
  const result = scenarioCoverage(document());
  assert.equal(result.summary.required, 36);
  assert.equal(result.summary.missing, 35);
});
test('missing scenario tasks include explicit manual capture action', () => {
  const result = scenarioCoverage(document(), { ...narrow,
    dimensions: { ...narrow.dimensions, locales: ['en', 'fr'] } });
  const tasks = missingScenarioTasks(result);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].action, 'CAPTURE_REQUIRED');
  assert.equal(tasks[0].status, 'UNKNOWN');
});
test('missing tasks cannot be fabricated for invalid coverage input', () => {
  assert.equal(missingScenarioTasks(null), null);
  assert.equal(missingScenarioTasks({ ok: false }), null);
  assert.equal(missingScenarioTasks({ ok: true, missing: [] }, -1), null);
});
test('missing task limit bounds potentially large output', () => {
  const result = scenarioCoverage(document());
  assert.equal(missingScenarioTasks(result, 2).length, 2);
  assert.equal(missingScenarioTasks(result, 0).length, 0);
});
test('worklist summarizes clean minimum scenario without tasks', () => {
  const result = reviewPlan(document(), narrow);
  assert.equal(result.ok, true);
  assert.equal(result.tasks.length, 0);
  assert.equal(result.summary.state, 'PASS');
});
test('worklist exposes incomplete French coverage as a manual task', () => {
  const result = reviewPlan(document(), { ...narrow,
    dimensions: { ...narrow.dimensions, locales: ['en', 'fr'] } });
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].reason, 'CAPTURE_MISSING');
  assert.equal(result.tasks[0].state, 'UNKNOWN');
});
test('worklist prioritizes blocking keyboard issue over coverage gaps', () => {
  const input = withCapture({ controls: [control('x', { keyboard: 'FAIL' })] });
  const options = { ...narrow, dimensions: { ...narrow.dimensions, locales: ['en', 'fr'] } };
  const result = reviewPlan(input, options);
  assert.ok(result.tasks.length >= 2);
  assert.equal(result.tasks[0].priority, 'block');
  assert.equal(result.tasks[0].reason, 'KEYBOARD_FAIL');
});
test('worklist never promotes YES from a review decision', () => {
  const input = withCapture({ controls: [control('x', { focus: 'FAIL' })] });
  const result = reviewPlan(input, narrow);
  assert.ok(result.tasks.every((task) => task.state === 'UNKNOWN'));
  assert.equal(input.captures[0].claims[0].state, 'UNKNOWN');
});
test('worklist does not schedule or automatically change any workflows', () => {
  const result = reviewPlan(document(), narrow);
  assert.equal(result.ok, true);
  assert.ok(result.tasks.every((task) => task.action === 'HUMAN_REVIEW' || task.action === 'CAPTURE_REQUIRED'));
});
test('invalid worklist input fails closed', () => {
  const input = document();
  input.captures[0].assets[0].path = '../unsafe';
  const result = reviewPlan(input, narrow);
  assert.equal(result.ok, false);
  assert.deepEqual(result.tasks, []);
});
test('compact gate summary agrees with the drill gate list', () => {
  const result = compactGateSummary(document());
  assert.equal(result.ok, true);
  assert.equal(result.gates.length, 12);
});
test('compact gates reject malformed input', () => {
  assert.equal(compactGateSummary({}).ok, false);
});
test('empty drill begins without fabricated source-backed records', () => {
  assert.deepEqual(blankDrill(), { version: 1, sources: [], captures: [] });
});
test('empty drill full coverage is empty when no route scope supplied', () => {
  const result = scenarioCoverage(blankDrill());
  assert.equal(result.ok, true);
  assert.equal(result.summary.required, 0);
});
test('full coverage remains UNKNOWN if environment has not been observed', () => {
  const result = scenarioCoverage(blankDrill(), { ...narrow, routes: ['/synthetic'] });
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.status, 'UNKNOWN');
});

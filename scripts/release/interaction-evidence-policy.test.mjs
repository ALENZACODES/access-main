import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRIORITY, RULES, priority, queue, routeMatrix, staleEvidence, comparePriorities, filterQueue, humanTasks } from './interaction-evidence-policy.mjs';
import { KINDS, LANGUAGES, UNKNOWN } from './interaction-evidence-contract.mjs';
import { DATE, HASH, check, route, snapshot, paired, measured } from './interaction-evidence-fixtures.mjs';
const q = input => queue(input, { today: DATE });
const matrix = input => routeMatrix(input, { today: DATE });
const task = input => humanTasks(input, { today: DATE });

test('priority vocabulary has three ordered categories', () => {
  assert.deepEqual(PRIORITY, ['critical', 'review', 'information']);
  assert.equal(new Set(PRIORITY).size, 3);
});
test('every policy review flag has a declared priority', () => {
  for (const [code, level] of Object.entries(RULES)) {
    assert.equal(priority(code), level);
    assert.ok(PRIORITY.includes(level));
  }
});
test('unknown priority does not automatically become critical', () => {
  assert.equal(priority('SOME_NEW_CODE'), 'information');
});
test('recorded failure has critical review priority', () => assert.equal(priority('RECORDED_FAILURE'), 'critical'));
test('touch target below 44 has critical review priority', () => assert.equal(priority('TOUCH_UNDER_44'), 'critical'));
test('hidden focus has critical review priority', () => assert.equal(priority('FOCUS_NOT_VISIBLE'), 'critical'));
test('unreachable keyboard control has critical review priority', () => assert.equal(priority('KEYBOARD_UNREACHABLE'), 'critical'));
test('missing accessible name has critical review priority', () => assert.equal(priority('NO_ACCESSIBLE_NAME'), 'critical'));
test('missing screen-reader announcement has critical review priority', () => assert.equal(priority('NOT_ANNOUNCED'), 'critical'));
test('conflicting observations have critical review priority', () => assert.equal(priority('CONFLICT'), 'critical'));
test('missing language has a review priority', () => assert.equal(priority('MISSING_LANGUAGE'), 'review'));
test('missing check kind has a review priority', () => assert.equal(priority('MISSING_KIND'), 'review'));
test('unknown observations have a review priority', () => assert.equal(priority('UNKNOWN_RESULT'), 'review'));
test('unknown source tier has a review priority', () => assert.equal(priority('UNKNOWN_TIER'), 'review'));
test('stale observation has a review priority', () => assert.equal(priority('OLD_EVIDENCE'), 'review'));
test('missing digest is information rather than a claimed access failure', () => assert.equal(priority('MISSING_DIGEST'), 'information'));
test('empty input produces an empty review queue', () => {
  const value = q({ schemaVersion: 1, capturedOn: DATE, routes: [] });
  assert.equal(value.ok, true);
  assert.deepEqual(value.value.counts, { critical: 0, review: 0, information: 0 });
});
test('unknown snapshot review queue remains open to human action', () => {
  const value = q(snapshot());
  assert.ok(value.value.total > 0);
  assert.ok(value.value.items.some(x => x.code === 'UNKNOWN_RESULT'));
});
test('review queue does not invent a certified result', () => {
  const value = q(snapshot());
  assert.ok(!value.value.items.some(x => x.code === 'CERTIFIED'));
  assert.match(value.value.caution, /human review/);
});
test('review queue sorts critical items before informational items', () => {
  const data = snapshot(route({ checks: [measured('touch-target', 'FAIL')] }));
  const v = q(data).value.items;
  const levels = v.map(x => PRIORITY.indexOf(x.priority));
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
});
test('all queue items have deterministic composite keys', () => {
  const value = q(snapshot()).value;
  assert.ok(value.items.every(row => row.key.includes('|/fictional|')));
});
test('queue counts exactly add up to total items', () => {
  const value = q(snapshot()).value;
  assert.equal(Object.values(value.counts).reduce((a, b) => a + b, 0), value.total);
});
test('queue filters to critical review items', () => {
  const value = q(snapshot(route({ checks: [measured('touch-target', 'FAIL')] })));
  assert.ok(filterQueue(value, { priority: 'critical' }).every(x => x.priority === 'critical'));
});
test('queue filters to one check kind', () => {
  const value = q(snapshot());
  assert.ok(filterQueue(value, { kind: 'touch-target' }).every(x => x.kind === 'touch-target'));
});
test('queue filters to English only', () => {
  const value = q(paired());
  assert.ok(filterQueue(value, { language: 'en' }).every(x => x.language === 'en'));
});
test('queue filters to one route path', () => {
  const value = q(snapshot());
  assert.ok(filterQueue(value, { path: '/fictional' }).every(x => x.path === '/fictional'));
});
test('queue rejects invalid input rather than creating tasks', () => {
  const value = q({ schemaVersion: 2, routes: [] });
  assert.equal(value.ok, false);
  assert.equal(value.value, undefined);
});
test('filterQueue returns no tasks for invalid reports', () => {
  assert.deepEqual(filterQueue({ ok: false }), []);
});
test('missing two-language route coverage is explicit', () => {
  const value = matrix(snapshot()).value;
  assert.equal(value.cells.length, KINDS.length * LANGUAGES.length);
  assert.equal(value.missing.filter(x => x.language === 'fr').length, KINDS.length);
});
test('two languages require a cell for each kind', () => {
  const value = matrix(paired()).value;
  assert.equal(value.cells.length, 12);
});
test('missing cells remain UNKNOWN instead of failing', () => {
  const value = matrix(snapshot()).value;
  assert.ok(value.missing.every(x => x.status === UNKNOWN));
});
test('an explicitly recorded target PASS appears only in the matching cell', () => {
  const value = matrix(snapshot(route({ checks: [measured()] }))).value;
  assert.equal(value.cells.find(x => x.language === 'en' && x.kind === 'touch-target').status, 'PASS');
});
test('a recorded touch FAIL appears in the cell', () => {
  const value = matrix(snapshot(route({ checks: [measured('touch-target', 'FAIL')] }))).value;
  assert.equal(value.cells.find(x => x.language === 'en' && x.kind === 'touch-target').status, 'FAIL');
});
test('unknown result dominates recorded PASS for same kind', () => {
  const data = snapshot(route({ checks: [measured(), check({ id: 'second' })] }));
  assert.equal(matrix(data).value.cells.find(x => x.language === 'en' && x.kind === 'touch-target').status, UNKNOWN);
});
test('recorded FAIL dominates unknown result for same kind', () => {
  const data = snapshot(route({ checks: [measured('touch-target', 'FAIL'), check({ id: 'second' })] }));
  assert.equal(matrix(data).value.cells.find(x => x.language === 'en' && x.kind === 'touch-target').status, 'FAIL');
});
test('matrix cell includes number of observations', () => {
  const data = snapshot(route({ checks: [measured(), check({ id: 'second' })] }));
  assert.equal(matrix(data).value.cells.find(x => x.kind === 'touch-target' && x.language === 'en').count, 2);
});
test('matrix cell includes number of distinct sources', () => {
  const data = snapshot(route({ checks: [measured(), check({ id: 'second', source: 'Independent fictional source' })] }));
  assert.equal(matrix(data).value.cells.find(x => x.kind === 'touch-target' && x.language === 'en').sourceCount, 2);
});
test('matrix does not incorrectly claim source review', () => {
  assert.match(matrix(snapshot()).value.caution, /UNKNOWN/);
});
test('matrix retains all paths in lexicographic order', () => {
  const data = snapshot(route({ id: 'z', path: '/z' }), route({ id: 'a', path: '/a' }));
  assert.deepEqual(matrix(data).value.paths, ['/a', '/z']);
});
test('conflicting multiple observations appear as review candidates', () => {
  const data = snapshot(route({ checks: [measured(), measured('touch-target', 'FAIL')] }));
  assert.equal(matrix(data).value.conflicts.length, 1);
});
test('identical PASS observations are not called conflicting', () => {
  const data = snapshot(route({ checks: [measured(), { ...measured(), id: 'second' }] }));
  assert.equal(matrix(data).value.conflicts.length, 0);
});
test('missing routes do not produce a guessed PASS', () => {
  const value = matrix({ schemaVersion: 1, capturedOn: DATE, routes: [] });
  assert.equal(value.value.cells.length, 0);
});
test('invalid matrix source returns issues', () => {
  assert.equal(matrix(snapshot(route({ path: '../unsafe' }))).ok, false);
});
test('source exactly 365 days old is not stale under default', () => {
  const data = snapshot(route({ checks: [check({ retrievedOn: '2025-11-21' })] }));
  assert.equal(staleEvidence(data).value.length, 0);
});
test('source 366 days old is stale under default', () => {
  const data = snapshot(route({ checks: [check({ retrievedOn: '2025-11-20' })] }));
  assert.equal(staleEvidence(data).value.length, 1);
});
test('source age can be assessed against a stricter documented limit', () => {
  const data = snapshot(route({ checks: [check({ retrievedOn: '2026-11-20' })] }));
  assert.equal(staleEvidence(data, { today: DATE, maxDays: 0 }).value.length, 1);
});
test('maximum age must be an integer', () => {
  assert.equal(staleEvidence(snapshot(), { maxDays: 1.2 }).ok, false);
});
test('maximum age cannot be negative', () => {
  assert.equal(staleEvidence(snapshot(), { maxDays: -1 }).ok, false);
});
test('maximum age cannot exceed the policy ceiling', () => {
  assert.equal(staleEvidence(snapshot(), { maxDays: 3651 }).ok, false);
});
test('stale review includes original provenance', () => {
  const data = snapshot(route({ checks: [check({ retrievedOn: '2024-01-01' })] }));
  const item = staleEvidence(data).value[0];
  assert.equal(item.source, check().source);
  assert.equal(item.licence, 'CC0-1.0');
});
test('stale review orders oldest observations first', () => {
  const data = snapshot(route({ checks: [check({ id: 'newer', retrievedOn: '2025-01-01' }), check({ id: 'older', retrievedOn: '2024-01-01' })] }));
  assert.deepEqual(staleEvidence(data).value.map(x => x.id), ['older', 'newer']);
});
test('stale review preserves observation identifiers', () => {
  const data = snapshot(route({ checks: [check({ id: 'needs-review', retrievedOn: '2024-01-01' })] }));
  assert.equal(staleEvidence(data).value[0].id, 'needs-review');
});
test('invalid document cannot generate staleness results', () => {
  assert.equal(staleEvidence({ ...snapshot(), schemaVersion: 3 }).ok, false);
});
test('comparison of identical snapshots produces no new items', () => {
  const v = comparePriorities(snapshot(), snapshot(), { today: DATE });
  assert.deepEqual(v.value.introduced, []);
});
test('comparison of identical snapshots produces no resolved items', () => {
  const v = comparePriorities(snapshot(), snapshot(), { today: DATE });
  assert.deepEqual(v.value.resolved, []);
});
test('comparison identifies newly recorded failure flags', () => {
  const before = snapshot(route({ checks: [check()] }));
  const after = snapshot(route({ checks: [measured('touch-target', 'FAIL')] }));
  const v = comparePriorities(before, after, { today: DATE });
  assert.ok(v.value.introduced.some(x => x.code === 'TOUCH_UNDER_44'));
});
test('comparison does not invent regressions across different check identities', () => {
  const before = snapshot(route({ checks: [check()] }));
  const after = snapshot(route({ checks: [measured('touch-target', 'FAIL')] }));
  const v = comparePriorities(before, after, { today: DATE });
  assert.equal(v.value.regressions.length, 0);
});
test('comparison flags removed old-evidence concern', () => {
  const before = snapshot(route({ checks: [check({ retrievedOn: '2024-01-01' })] }));
  const after = snapshot();
  const v = comparePriorities(before, after, { today: DATE });
  assert.ok(v.value.resolved.some(x => x.code === 'OLD_EVIDENCE'));
});
test('comparison rejects invalid before document', () => {
  const v = comparePriorities({ schemaVersion: 3 }, snapshot());
  assert.equal(v.ok, false);
});
test('comparison rejects invalid after document', () => {
  const v = comparePriorities(snapshot(), { schemaVersion: 3 });
  assert.equal(v.ok, false);
});
test('comparison warns that closing an item does not prove conditions changed', () => {
  const v = comparePriorities(snapshot(), snapshot(), { today: DATE });
  assert.match(v.value.caution, /not proof/);
});
test('human tasks begin in an OPEN state', () => {
  const v = task(snapshot()).value;
  assert.ok(v.every(x => x.status === 'OPEN'));
});
test('human tasks use deterministic identifiers', () => {
  const v = task(snapshot()).value;
  assert.equal(v[0].id, 'review-0001');
});
test('human tasks request evidence for unknown results', () => {
  const v = task(snapshot()).value;
  assert.ok(v.some(x => x.concern === 'UNKNOWN_RESULT' && x.action === 'collect-evidence'));
});
test('human tasks request a new source for outdated observations', () => {
  const data = snapshot(route({ checks: [check({ retrievedOn: '2024-01-01' })] }));
  const v = task(data).value;
  assert.ok(v.some(x => x.concern === 'OLD_EVIDENCE' && x.action === 'request-new-source'));
});
test('human tasks do not claim automatic fixes or certify conditions', () => {
  const v = task(snapshot()).value;
  assert.ok(v.every(x => ['collect-evidence', 'request-new-source', 'inspect-record'].includes(x.action)));
});
test('human tasks preserve language and route reference', () => {
  const v = task(snapshot()).value;
  assert.ok(v.every(x => ['en', 'fr'].includes(x.language) && x.path === '/fictional'));
});
test('human tasks reject malformed inventories', () => {
  assert.equal(task({ schemaVersion: 4 }).ok, false);
});
test('task ordering is stable for the same evidence', () => {
  assert.deepEqual(task(snapshot()).value, task(snapshot()).value);
});
test('filterQueue does not mutate the original queue', () => {
  const data = q(snapshot());
  const original = data.value.items.length;
  filterQueue(data, { priority: 'critical' });
  assert.equal(data.value.items.length, original);
});
test('matrix does not replace a missing language with guessed values', () => {
  const missing = matrix(snapshot()).value.cells.filter(x => x.language === 'fr');
  assert.ok(missing.every(x => x.status === UNKNOWN && x.count === 0));
});
test('matrix includes an explicit source count of zero for absent checks', () => {
  assert.equal(matrix(snapshot()).value.cells.find(x => x.language === 'fr').sourceCount, 0);
});
test('queue does not suppress missing language when checks are all PASS', () => {
  const data = snapshot(route({ checks: [measured()] }));
  assert.ok(q(data).value.items.some(x => x.code === 'MISSING_LANGUAGE'));
});
test('critical failure priority does not establish a real-world hazard', () => {
  assert.match(q(snapshot(route({ checks: [measured('keyboard', 'FAIL')] }))).value.caution, /not accessibility certifications/);
});

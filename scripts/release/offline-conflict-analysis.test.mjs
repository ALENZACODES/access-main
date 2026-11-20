import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONFLICT_KINDS, REVIEW_PRIORITIES, groupEvidence, provenanceKey,
  evidenceSignature, classifyGroup, classifyRelationships, analyzeConflicts,
  reviewPlan, groupCoverage,
} from './offline-conflict-analysis.mjs';
import { DAY, record, register, sample, opposed, sharedSource, deepCopy } from './offline-conflict-fixtures.mjs';
const run = value => analyzeConflicts(value, { today: DAY });
const kinds = output => output.conflicts.map(item => item.kind);

test('bounded conflict vocabulary has no duplicates', () => {
  assert.equal(new Set(CONFLICT_KINDS).size, CONFLICT_KINDS.length);
  assert.ok(CONFLICT_KINDS.includes('opposed'));
});
test('review priorities are not accessibility claim states', () => {
  assert.deepEqual(REVIEW_PRIORITIES, ['block', 'review', 'information']);
  assert.ok(!REVIEW_PRIORITIES.includes('YES'));
});
test('empty register has no invented conflict', () => {
  const output = run(register());
  assert.equal(output.ok, true);
  assert.deepEqual(output.conflicts, []);
  assert.equal(output.summary.totalRecords, 0);
});
test('one UNKNOWN record creates a review entry rather than a pass', () => {
  const output = run(sample());
  assert.equal(output.ok, true);
  assert.ok(kinds(output).includes('missing-claim'));
  assert.equal(output.summary.unknownRecords, 1);
});
test('one known state does not imply a conflict', () => {
  assert.deepEqual(run(register(record('a', { state: 'YES' }))).conflicts, []);
  assert.deepEqual(run(register(record('a', { state: 'NO' }))).conflicts, []);
});
test('known opposed states in a group are a blocking conflict', () => {
  const output = run(opposed());
  const opposedItem = output.conflicts.find(item => item.kind === 'opposed');
  assert.equal(opposedItem.priority, 'block');
  assert.deepEqual(opposedItem.recordIds, ['no', 'yes']);
});
test('opposed states on different attributes do not produce the same conflict', () => {
  const output = run(register(record('yes', { state: 'YES' }),
    record('no', { state: 'NO', attribute: 'accessibleWashroom' })));
  assert.ok(!kinds(output).includes('opposed'));
});
test('opposed states on different subjects are not falsely grouped', () => {
  const output = run(register(record('yes', { state: 'YES' }),
    record('no', { state: 'NO', subject: 'other-example' })));
  assert.ok(!kinds(output).includes('opposed'));
});
test('UNKNOWN never votes against a known state', () => {
  const output = run(register(record('yes', { state: 'YES' }), record('undecided')));
  assert.ok(!kinds(output).includes('opposed'));
});
test('UNKNOWN is not converted to NO by an opposed source', () => {
  const data = register(record('no', { state: 'NO' }), record('unknown'));
  const output = run(data);
  assert.ok(!kinds(output).includes('opposed'));
  assert.equal(data.records[1].state, 'UNKNOWN');
});
test('same source with opposed states gets separate source contradiction', () => {
  const output = run(sharedSource());
  assert.ok(kinds(output).includes('source-contradiction'));
  assert.ok(kinds(output).includes('opposed'));
});
test('different URLs remove same-source contradiction without suppressing opposition', () => {
  const output = run(opposed());
  assert.ok(kinds(output).includes('opposed'));
  assert.ok(!kinds(output).includes('source-contradiction'));
});
test('multiple records sharing one source are not independent evidence', () => {
  const output = run(register(record('a', { state: 'YES' }), record('b', { state: 'YES' })));
  const entry = output.conflicts.find(x => x.kind === 'source-shared');
  assert.equal(entry.priority, 'information');
});
test('source-shared informational finding does not imply disagreement', () => {
  const output = run(register(record('a', { state: 'YES' }), record('b', { state: 'YES' })));
  assert.equal(output.summary.opposedGroups, 0);
  assert.equal(output.summary.byKind.opposed, 0);
});
test('change in provenance separates shared-source case', () => {
  const output = run(register(record('a', { state: 'YES' }),
    record('b', { state: 'YES', licence: 'MIT' })));
  assert.ok(!kinds(output).includes('source-shared'));
});
test('different capturedOn dates with changing state warrant review', () => {
  const output = run(register(record('old', { state: 'YES', capturedOn: '2026-11-18' }),
    record('new', { state: 'NO', capturedOn: '2026-11-19' })));
  assert.ok(kinds(output).includes('dated-conflict'));
});
test('same capture dates do not trigger dated conflict', () => {
  const output = run(sharedSource());
  assert.ok(!kinds(output).includes('dated-conflict'));
});
test('date changes without state changes do not trigger dated conflict', () => {
  const output = run(register(record('old', { state: 'YES', capturedOn: '2026-11-18' }),
    record('new', { state: 'YES', capturedOn: '2026-11-19' })));
  assert.ok(!kinds(output).includes('dated-conflict'));
});
test('same source provenance produces one key', () => {
  assert.equal(provenanceKey(record('a')), provenanceKey(record('b')));
});
test('licence is part of provenance key', () => {
  assert.notEqual(provenanceKey(record('a')), provenanceKey(record('a', { licence: 'MIT' })));
});
test('retrieval date is part of provenance key', () => {
  assert.notEqual(provenanceKey(record('a')), provenanceKey(record('a', { retrievedOn: DAY })));
});
test('tier is part of provenance key', () => {
  assert.notEqual(provenanceKey(record('a')), provenanceKey(record('a', { tier: 'E' })));
});
test('SHA-256 event signatures have fixed shape', () => {
  const digest = evidenceSignature(record('a'));
  assert.match(digest, /^[a-f0-9]{64}$/u);
});
test('event signatures detect changed claim states', () => {
  assert.notEqual(evidenceSignature(record('a')), evidenceSignature(record('a', { state: 'YES' })));
});
test('event signatures detect changed source attribution', () => {
  assert.notEqual(evidenceSignature(record('a')),
    evidenceSignature(record('a', { source: 'https://example.net/fictional' })));
});
test('event signatures ignore relatedIds ordering', () => {
  const a = record('a', { relatedIds: ['b', 'c'] });
  const b = record('a', { relatedIds: ['c', 'b'] });
  assert.equal(evidenceSignature(a), evidenceSignature(b));
});
test('event signatures include the capture date', () => {
  assert.notEqual(evidenceSignature(record('a')),
    evidenceSignature(record('a', { capturedOn: '2026-11-18' })));
});
test('grouping by subject and attribute is deterministic', () => {
  const first = groupEvidence([record('z'), record('a')]);
  const second = groupEvidence([record('a'), record('z')]);
  assert.deepEqual(first, second);
});
test('grouping does not mutate input order', () => {
  const entries = [record('z'), record('a')];
  groupEvidence(entries);
  assert.deepEqual(entries.map(x => x.id), ['z', 'a']);
});
test('groups are separate by field', () => {
  const entries = [record('a'), record('b', { attribute: 'ramp' })];
  assert.equal(groupEvidence(entries).length, 2);
});
test('group entries are sorted by stable id', () => {
  assert.deepEqual(groupEvidence([record('z'), record('a')])[0].entries.map(x => x.id), ['a', 'z']);
});
test('classifyGroup does not modify evidence records', () => {
  const group = groupEvidence([record('a'), record('b')])[0];
  const before = deepCopy(group.entries);
  classifyGroup(group);
  assert.deepEqual(group.entries, before);
});
test('related-record opposition is flagged distinctly', () => {
  const data = register(record('a', { state: 'YES', relatedIds: ['b'] }), record('b', { state: 'NO' }));
  const output = run(data);
  assert.ok(kinds(output).includes('related-disagreement'));
});
test('related links in both directions do not duplicate a finding', () => {
  const data = register(record('a', { state: 'YES', relatedIds: ['b'] }),
    record('b', { state: 'NO', relatedIds: ['a'] }));
  assert.equal(kinds(run(data)).filter(x => x === 'related-disagreement').length, 1);
});
test('related UNKNOWN evidence does not become an opposed claim', () => {
  const data = register(record('a', { state: 'YES', relatedIds: ['b'] }), record('b'));
  assert.equal(kinds(run(data)).includes('related-disagreement'), false);
});
test('related different subjects are not treated as a contradiction', () => {
  const data = register(record('a', { state: 'YES', relatedIds: ['b'] }),
    record('b', { state: 'NO', subject: 'other-subject' }));
  assert.equal(kinds(run(data)).includes('related-disagreement'), false);
});
test('related different attributes are not treated as a contradiction', () => {
  const data = register(record('a', { state: 'YES', relatedIds: ['b'] }),
    record('b', { state: 'NO', attribute: 'accessibleParking' }));
  assert.equal(kinds(run(data)).includes('related-disagreement'), false);
});
test('relationship findings reference the recorded IDs', () => {
  const data = [record('a', { state: 'YES', relatedIds: ['b'] }), record('b', { state: 'NO' })];
  assert.deepEqual(classifyRelationships(data)[0].recordIds, ['a', 'b']);
});
test('all reported conflict kinds belong to published vocabulary', () => {
  const output = run(sharedSource());
  assert.ok(output.conflicts.every(x => CONFLICT_KINDS.includes(x.kind)));
});
test('all priorities belong to published vocabulary', () => {
  const output = run(sharedSource());
  assert.ok(output.conflicts.every(x => REVIEW_PRIORITIES.includes(x.priority)));
});
test('source URLs are unique in each conflict entry', () => {
  const output = run(sharedSource());
  assert.ok(output.conflicts.every(x => new Set(x.sourceUrls).size === x.sourceUrls.length));
});
test('record IDs are unique in each conflict entry', () => {
  const output = run(sharedSource());
  assert.ok(output.conflicts.every(x => new Set(x.recordIds).size === x.recordIds.length));
});
test('summary source counts are independent of input ordering', () => {
  const a = run(sharedSource());
  const b = run(register(...sharedSource().records.reverse()));
  assert.deepEqual(a, b);
});
test('summary conflict counts match emitted array size', () => {
  const output = run(sharedSource());
  assert.equal(output.summary.conflicts, output.conflicts.length);
});
test('summary priority buckets sum to conflict count', () => {
  const output = run(sharedSource());
  assert.equal(Object.values(output.summary.byPriority).reduce((a, b) => a + b, 0), output.conflicts.length);
});
test('summary kind buckets sum to conflict count', () => {
  const output = run(sharedSource());
  assert.equal(Object.values(output.summary.byKind).reduce((a, b) => a + b, 0), output.conflicts.length);
});
test('fingerprint is deterministic across input ordering', () => {
  const data = opposed();
  const reverse = register(...data.records.reverse());
  assert.equal(run(data).fingerprint, run(reverse).fingerprint);
});
test('a malformed source prevents analysis and suppresses review output', () => {
  const output = run(register(record('a', { source: null })));
  assert.equal(output.ok, false);
  assert.equal(output.summary, null);
  assert.deepEqual(output.conflicts, []);
});
test('analysis never changes original evidence states', () => {
  const input = sharedSource();
  const before = deepCopy(input);
  run(input);
  assert.deepEqual(input, before);
});
test('human review worklist keeps UNKNOWN as the outcome', () => {
  const result = reviewPlan(opposed());
  assert.equal(result.ok, true);
  assert.ok(result.tasks.every(task => task.outcome === 'UNKNOWN'));
});
test('human review worklist includes source URLs not inferred statuses', () => {
  const result = reviewPlan(opposed());
  assert.ok(result.tasks.every(task => task.sourceUrls.length > 0));
});
test('human review tasks order blocking before review', () => {
  const result = reviewPlan(register(record('a'), record('b', { state: 'YES' }), record('c', { state: 'NO' }), record('d', { subject: 'another' })));
  const seen = result.tasks.map(x => x.priority);
  assert.ok(seen.indexOf('block') < seen.lastIndexOf('review'));
});
test('human review tasks are numbered consecutively', () => {
  const tasks = reviewPlan(sharedSource()).tasks;
  assert.deepEqual(tasks.map(x => x.order), tasks.map((_, index) => index + 1));
});
test('invalid registers cannot generate human review tasks', () => {
  const result = reviewPlan(register(record('a', { tier: 'not-a-tier' })));
  assert.equal(result.ok, false);
  assert.deepEqual(result.tasks, []);
});
test('coverage reports a missing field as UNKNOWN', () => {
  const result = groupCoverage(sample(), [{ subject: 'example-site', attribute: 'accessibleParking' }]);
  assert.deepEqual(result.missing, [{ subject: 'example-site', attribute: 'accessibleParking',
    state: 'UNKNOWN', reason: 'not-recorded' }]);
});
test('coverage does not list a present field as missing', () => {
  const result = groupCoverage(sample(), [{ subject: 'example-site', attribute: 'stepFreeEntrance' }]);
  assert.deepEqual(result.missing, []);
});
test('coverage handles an empty expected list', () => assert.deepEqual(groupCoverage(sample(), []).missing, []));
test('coverage rejects malformed requested items', () => {
  assert.equal(groupCoverage(sample(), [{ subject: 5, attribute: 'ramp' }]).ok, false);
});
test('coverage rejects malformed source register', () => {
  assert.equal(groupCoverage(register(record('a', { source: null })), []).ok, false);
});
test('coverage output is stable across expected order', () => {
  const expected = [{ subject: 'a', attribute: 'b' }, { subject: 'c', attribute: 'd' }];
  const a = groupCoverage(sample(), expected).missing;
  const b = groupCoverage(sample(), [...expected].reverse()).missing;
  assert.deepEqual(a, b);
});

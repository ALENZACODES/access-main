import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELTA_KINDS, compareIncidentRegisters,
  filterIncidentChanges, compareIncidentHistories, assessIncidentRegression,
} from './offline-release-incident-delta.mjs';
import {
  fixtureIncident, fixtureRegister, fixtureSource, TODAY, clone,
} from './offline-release-incident-fixtures.mjs';
import { transitionIncident } from './offline-release-incidents.mjs';

const before = () => fixtureRegister(fixtureIncident());
function change(fn) {
  const later = clone(before());
  fn(later.incidents[0], later);
  return compareIncidentRegisters(before(), later);
}
const kinds = (result) => result.changes.map((item) => item.kind);

test('delta vocabulary is stable and unique', () => {
  assert.equal(new Set(DELTA_KINDS).size, DELTA_KINDS.length);
  assert.ok(DELTA_KINDS.includes('source-lost'));
  assert.ok(DELTA_KINDS.includes('history-changed'));
});

test('identical snapshots produce only an explicit same marker', () => {
  const result = compareIncidentRegisters(before(), before());
  assert.equal(result.ok, true);
  assert.deepEqual(kinds(result), ['same']);
  assert.equal(result.summary.needsHumanReview, false);
});

test('input order does not affect comparison ordering', () => {
  const originalA = fixtureRegister(fixtureIncident('b'), fixtureIncident('a'));
  const originalB = fixtureRegister(fixtureIncident('a'), fixtureIncident('b'));
  assert.deepEqual(compareIncidentRegisters(originalA, originalA),
    compareIncidentRegisters(originalB, originalB));
});

test('additional incident receives added classification', () => {
  const result = compareIncidentRegisters(before(),
    fixtureRegister(fixtureIncident(), fixtureIncident('second')));
  assert.equal(result.ok, true);
  assert.ok(result.changes.some((x) => x.id === 'second' && x.kind === 'added'));
  assert.equal(result.summary.recordsAfter, 2);
});

test('removed incident is explicit and reviewable', () => {
  const result = compareIncidentRegisters(before(), fixtureRegister());
  assert.deepEqual(kinds(result), ['removed']);
  assert.equal(result.summary.needsHumanReview, true);
  assert.equal(result.changes[0].afterHash, null);
});

test('changing the status emits status-changed', () => {
  const earlier = before();
  const later = transitionIncident(earlier, 'incident-1', 'triage', TODAY, ['source-1']).register;
  const result = compareIncidentRegisters(earlier, later);
  assert.ok(kinds(result).includes('status-changed'));
  assert.ok(kinds(result).includes('history-changed'));
});

test('severity changes are independently reported', () => {
  const result = change((item) => { item.severity = 'critical'; });
  assert.deepEqual(kinds(result), ['severity-changed']);
  assert.equal(result.summary.needsHumanReview, true);
});

test('area changes are independently reported', () => {
  assert.deepEqual(kinds(change((item) => { item.area = 'focus'; })), ['area-changed']);
});

test('English title changes affect translation classification', () => {
  assert.deepEqual(kinds(change((item) => { item.title.en = 'Another synthetic title'; })),
    ['translation-changed']);
});

test('French summary changes affect translation classification', () => {
  assert.deepEqual(kinds(change((item) => { item.summary.fr = 'Autre exemple.'; })),
    ['translation-changed']);
});

test('source retrieval date change is source-changed', () => {
  const result = change((item) => { item.sources[0].retrievedOn = '2026-11-18'; });
  assert.deepEqual(kinds(result), ['source-changed']);
});

test('licence replacement is source-changed', () => {
  const result = change((item) => { item.sources[0].licence = 'CC-BY-4.0'; });
  assert.deepEqual(kinds(result), ['source-changed']);
});

test('evidence tier change is not an accessibility upgrade', () => {
  const result = change((item) => { item.sources[0].tier = 1; });
  assert.deepEqual(kinds(result), ['source-changed']);
  assert.equal(result.changes[0].claimState, 'UNKNOWN');
});

test('source withdrawal identifies source-lost', () => {
  const prior = fixtureIncident('incident-1', {
    sourceRefs: ['source-1', 'source-2'],
    sources: [fixtureSource('source-1'), fixtureSource('source-2')],
  });
  const next = clone(prior);
  next.sourceRefs = ['source-1'];
  next.sources = [fixtureSource('source-1')];
  const result = compareIncidentRegisters(fixtureRegister(prior), fixtureRegister(next));
  assert.ok(kinds(result).includes('source-lost'));
  assert.ok(kinds(result).includes('source-changed'));
});

test('a newly cited source is reported as gained', () => {
  const prior = fixtureIncident();
  const next = clone(prior);
  next.sources.push(fixtureSource('source-2'));
  next.sourceRefs.push('source-2');
  const result = compareIncidentRegisters(fixtureRegister(prior), fixtureRegister(next));
  assert.ok(kinds(result).includes('source-gained'));
  assert.equal(result.summary.needsHumanReview, true);
});

test('related dependency changes are explicit', () => {
  const a = fixtureRegister(fixtureIncident('a'), fixtureIncident('b'));
  const b = clone(a);
  b.incidents[0].relatedIds = ['b'];
  const result = compareIncidentRegisters(a, b);
  assert.ok(result.changes.some((x) => x.kind === 'dependency-changed'));
});

test('invalid earlier snapshot fails closed', () => {
  const invalid = fixtureRegister(fixtureIncident('one', { sources: [] }));
  const result = compareIncidentRegisters(invalid, before());
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.equal(result.changes.length, 0);
  assert.ok(result.problems.some((x) => x.snapshot === 'earlier'));
});

test('invalid later snapshot fails closed', () => {
  const invalid = fixtureRegister(fixtureIncident('one', { claimState: 'YES' }));
  const result = compareIncidentRegisters(before(), invalid);
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.ok(result.problems.some((x) => x.snapshot === 'later'));
});

test('filtered page maintains a deterministic continuation cursor', () => {
  const a = fixtureRegister();
  const b = fixtureRegister(fixtureIncident('a'), fixtureIncident('b'), fixtureIncident('c'));
  const compared = compareIncidentRegisters(a, b);
  const first = filterIncidentChanges(compared, { limit: 2 });
  assert.equal(first.ok, true);
  assert.equal(first.total, 3);
  assert.equal(first.items.length, 2);
  assert.equal(first.next, 2);
  const second = filterIncidentChanges(compared, { from: first.next });
  assert.equal(second.items.length, 1);
  assert.equal(second.next, null);
});

test('filter can restrict to the desired difference types', () => {
  const compared = compareIncidentRegisters(before(), fixtureRegister());
  assert.deepEqual(filterIncidentChanges(compared, { kinds: ['added'] }).items, []);
  assert.deepEqual(filterIncidentChanges(compared, { kinds: ['removed'] }).items.map((x) => x.kind), ['removed']);
});

test('filter rejects unsupported kinds', () => {
  const result = filterIncidentChanges(compareIncidentRegisters(before(), before()), { kinds: ['magic'] });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((x) => x.code === 'KIND_FILTER'));
});

test('filter rejects invalid sorting', () => {
  const result = filterIncidentChanges(compareIncidentRegisters(before(), before()), { sort: 'random' });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((x) => x.code === 'SORT_INVALID'));
});

test('filter rejects negative and oversized pages', () => {
  const compared = compareIncidentRegisters(before(), before());
  for (const opts of [{ from: -1 }, { limit: 0 }, { limit: 501 }, { from: 1.5 }]) {
    assert.equal(filterIncidentChanges(compared, opts).ok, false);
  }
});

test('filters reject unknown severity', () => {
  const result = filterIncidentChanges(compareIncidentRegisters(before(), before()), { severity: 'urgent' });
  assert.equal(result.ok, false);
});

test('filter severity restriction works on real changes', () => {
  const earlier = fixtureRegister();
  const later = fixtureRegister(fixtureIncident('a', { severity: 'high' }),
    fixtureIncident('b', { severity: 'low' }));
  const compared = compareIncidentRegisters(earlier, later);
  assert.deepEqual(filterIncidentChanges(compared, { severity: 'high' }).items.map((x) => x.id), ['a']);
});

test('history changes are detected on appended workflow action', () => {
  const earlier = before();
  const later = transitionIncident(earlier, 'incident-1', 'triage', TODAY, ['source-1']).register;
  const compared = compareIncidentHistories(earlier, later);
  assert.deepEqual(compared.items.map((x) => x.kind), ['appended-history']);
  assert.equal(compared.items[0].events, 1);
});

test('history rewrite is not silently accepted', () => {
  const earlier = transitionIncident(before(), 'incident-1', 'triage', TODAY, ['source-1']).register;
  const later = clone(earlier);
  later.incidents[0].history[0].sourceRefs = [];
  const compared = compareIncidentHistories(earlier, later);
  assert.equal(compared.ok, true);
  assert.deepEqual(compared.items.map((x) => x.kind), ['rewritten-history']);
});

test('incident removal reports removed history', () => {
  const result = compareIncidentHistories(before(), fixtureRegister());
  assert.deepEqual(result.items.map((x) => x.kind), ['removed-history']);
});

test('new incidents have explicit new-history classification', () => {
  const result = compareIncidentHistories(fixtureRegister(), before());
  assert.deepEqual(result.items.map((x) => x.kind), ['new-history']);
});

test('regression catches newly added severe incident', () => {
  const result = assessIncidentRegression(fixtureRegister(),
    fixtureRegister(fixtureIncident('high', { severity: 'high' })));
  assert.equal(result.blocked, true);
  assert.ok(result.reasons.some((x) => x.reason === 'NEW_SEVERE_INCIDENT'));
});

test('regression catches severity increase', () => {
  const later = clone(before());
  later.incidents[0].severity = 'high';
  const result = assessIncidentRegression(before(), later);
  assert.ok(result.reasons.some((x) => x.reason === 'SEVERITY_INCREASED'));
});

test('open incident deletion is a regression', () => {
  const result = assessIncidentRegression(before(), fixtureRegister());
  assert.ok(result.reasons.some((x) => x.reason === 'OPEN_INCIDENT_REMOVED'));
});

test('low severity new incident is reported without automatic blocking', () => {
  const later = fixtureRegister(fixtureIncident('low', { severity: 'low' }));
  const result = assessIncidentRegression(fixtureRegister(), later);
  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
});

test('invalid source history cannot produce a clean regression result', () => {
  const invalid = fixtureRegister(fixtureIncident('one', { sources: [] }));
  const result = assessIncidentRegression(before(), invalid);
  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
});

test('comparison returns opaque hashes, not raw private notes', () => {
  const earlier = before();
  const later = clone(earlier);
  later.incidents[0].title.en = 'New synthetic wording';
  const result = compareIncidentRegisters(earlier, later);
  assert.match(result.changes[0].beforeHash, /^sha256:[0-9a-f]{64}$/u);
  assert.match(result.changes[0].afterHash, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(result).includes('New synthetic wording'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELTA_KINDS, compareAcceptanceLedgers, guardAcceptanceChange,
  acceptanceChangeIndex, unknownTransitionCount,
} from './offline-acceptance-delta.mjs';
import { acceptanceFingerprint } from './offline-acceptance-ledger.mjs';
import { ledger, route, check, provenance } from './offline-acceptance-fixtures.mjs';

const base = () => ledger();
const changed = (updates = {}) => ledger({ routes: [route({ checks: [check(updates)] })] });
const types = (result) => result.changes.map((entry) => entry.kind);
const one = (result) => result.changes[0];

test('delta vocabulary contains distinct audited change dimensions', () => {
  assert.equal(new Set(DELTA_KINDS).size, DELTA_KINDS.length);
  assert.ok(DELTA_KINDS.includes('unknown-transition'));
  assert.ok(DELTA_KINDS.includes('evidence-source'));
  assert.ok(DELTA_KINDS.includes('route-added'));
});

test('identical ledgers create no changes', () => {
  const result = compareAcceptanceLedgers(base(), base());
  assert.equal(result.ok, true);
  assert.equal(result.summary.total, 0);
  assert.deepEqual(result.changes, []);
});

test('no changes do not request human review', () => {
  assert.equal(compareAcceptanceLedgers(base(), base()).summary.requiresHumanReview, false);
});

test('route addition is explicit', () => {
  const later = ledger({ routes: [route(), route({ id: 'second', path: '/second' })] });
  const result = compareAcceptanceLedgers(base(), later);
  assert.ok(types(result).includes('route-added'));
  assert.equal(result.summary.requiresHumanReview, true);
});

test('route deletion is explicit', () => {
  const later = ledger({ routes: [] });
  assert.deepEqual(types(compareAcceptanceLedgers(base(), later)), ['route-removed']);
});

test('route identity persists through path change', () => {
  const later = ledger({ routes: [route({ path: '/another' })] });
  assert.deepEqual(types(compareAcceptanceLedgers(base(), later)), ['route-path']);
});

test('route label change does not change a recorded state', () => {
  const later = ledger({ routes: [route({ label: { en: 'Later route', fr: 'Autre page' } })] });
  assert.deepEqual(types(compareAcceptanceLedgers(base(), later)), ['route-label']);
});

test('new check is visible even if UNKNOWN', () => {
  const later = ledger({ routes: [route({ checks: [check(), check({ id: 'extra', kind: 'screen-reader' })] })] });
  const result = compareAcceptanceLedgers(base(), later);
  assert.deepEqual(types(result), ['check-added']);
  assert.equal(one(result).after.state, 'UNKNOWN');
});

test('removed check is never assumed to have failed', () => {
  const later = ledger({ routes: [route({ checks: [] })] });
  const result = compareAcceptanceLedgers(base(), later);
  assert.deepEqual(types(result), ['check-removed']);
  assert.equal(one(result).after, null);
});

test('UNKNOWN to PASS remains explicitly marked as unknown transition', () => {
  const result = compareAcceptanceLedgers(base(), changed({ state: 'PASS' }));
  assert.deepEqual(types(result), ['unknown-transition']);
  assert.equal(one(result).before, 'UNKNOWN');
  assert.equal(one(result).after, 'PASS');
});

test('PASS to UNKNOWN remains explicitly marked as unknown transition', () => {
  const result = compareAcceptanceLedgers(changed({ state: 'PASS' }), base());
  assert.deepEqual(types(result), ['unknown-transition']);
  assert.equal(one(result).after, 'UNKNOWN');
});

test('FAIL to PASS is a recorded change, not a venue determination', () => {
  const result = compareAcceptanceLedgers(changed({ state: 'FAIL' }), changed({ state: 'PASS' }));
  assert.deepEqual(types(result), ['state-changed']);
});

test('PASS to FAIL is a recorded change', () => {
  const result = compareAcceptanceLedgers(changed({ state: 'PASS' }), changed({ state: 'FAIL' }));
  assert.deepEqual(types(result), ['state-changed']);
});

test('source URL changes require a human review decision', () => {
  const later = changed({ evidence: provenance({ source: 'https://example.org/other' }) });
  const result = compareAcceptanceLedgers(base(), later);
  assert.deepEqual(types(result), ['evidence-source']);
  assert.equal(result.summary.requiresHumanReview, true);
});

test('licence changes are visible and important', () => {
  const later = changed({ evidence: provenance({ licence: 'CC-BY-4.0' }) });
  assert.deepEqual(types(compareAcceptanceLedgers(base(), later)), ['evidence-licence']);
});

test('retrieval date changes remain separate from source changes', () => {
  const later = ledger({ capturedOn: '2026-11-20', routes: [route({
    checks: [check({ evidence: provenance({ retrievedOn: '2026-11-20' }) })],
  })] });
  const result = compareAcceptanceLedgers(base(), later);
  assert.deepEqual(types(result), ['evidence-date']);
});

test('tier changes do not by themselves imply improved evidence', () => {
  const later = changed({ evidence: provenance({ tier: 1 }) });
  assert.deepEqual(types(compareAcceptanceLedgers(base(), later)), ['evidence-tier']);
});

test('run identifiers are independently compared', () => {
  const later = changed({ evidence: provenance({ runId: 'run-2' }) });
  assert.deepEqual(types(compareAcceptanceLedgers(base(), later)), ['evidence-run']);
});

test('artifact digests are independently compared', () => {
  const later = changed({ evidence: provenance({ artifactSha256: 'b'.repeat(64) }) });
  assert.deepEqual(types(compareAcceptanceLedgers(base(), later)), ['evidence-digest']);
});

test('check category changes are reported', () => {
  assert.deepEqual(types(compareAcceptanceLedgers(base(), changed({ kind: 'screen-reader' }))), ['check-kind']);
});

test('check label changes are reported', () => {
  const later = changed({ label: { en: 'Changed test', fr: 'Essai modifié' } });
  assert.deepEqual(types(compareAcceptanceLedgers(base(), later)), ['check-label']);
});

test('review-link changes are reported', () => {
  assert.deepEqual(types(compareAcceptanceLedgers(base(), changed({ reviewItemId: 'review-a' }))), ['review-link']);
});

test('review notes are included as separate editorial changes', () => {
  const later = changed({ note: { en: 'New note', fr: 'Nouvelle note' } });
  assert.deepEqual(types(compareAcceptanceLedgers(base(), later)), ['note-changed']);
});

test('multiple changes are sorted deterministically', () => {
  const later = changed({ state: 'FAIL', kind: 'screen-reader',
    label: { en: 'Changed', fr: 'Changé' },
    evidence: provenance({ tier: 1, source: 'https://example.org/other' }) });
  const result = compareAcceptanceLedgers(base(), later);
  assert.deepEqual(types(result), ['check-kind', 'check-label', 'evidence-source', 'evidence-tier', 'unknown-transition']);
});

test('input order never changes a change set', () => {
  const before = ledger({ routes: [route({ id: 'b', path: '/b' }), route({ id: 'a', path: '/a' })] });
  const after = ledger({ routes: [route({ id: 'a', path: '/a', checks: [check({ state: 'FAIL' })] }),
    route({ id: 'b', path: '/b' })] });
  const reversed = ledger({ routes: [route({ id: 'b', path: '/b' }), route({ id: 'a', path: '/a', checks: [check({ state: 'FAIL' })] })] });
  assert.deepEqual(compareAcceptanceLedgers(before, after), compareAcceptanceLedgers(before, reversed));
});

test('invalid earlier ledger fails without a fabricated empty delta', () => {
  const invalid = ledger({ routes: [route({ checks: [check({ state: 'YES' })] })] });
  const result = compareAcceptanceLedgers(invalid, base());
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.equal(result.changes.length, 0);
});

test('invalid later ledger also fails closed', () => {
  const result = compareAcceptanceLedgers(base(), changed({ state: 'certified' }));
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.snapshot === 'after'));
});

test('summary counts all distinct kinds', () => {
  const later = changed({ state: 'FAIL', evidence: provenance({ tier: 1 }) });
  const result = compareAcceptanceLedgers(base(), later);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.byKind['unknown-transition'], 1);
  assert.equal(result.summary.byKind['evidence-tier'], 1);
});

test('delta summary distinguishes priority classes', () => {
  const later = changed({ label: { en: 'Later', fr: 'Plus tard' } });
  const result = compareAcceptanceLedgers(base(), later);
  assert.equal(result.summary.priorities[3], 1);
  assert.equal(result.summary.priorities[1], 0);
});

test('explicit base fingerprint guards concurrent edits', () => {
  const original = base();
  const latest = changed({ state: 'FAIL' });
  const fingerprint = acceptanceFingerprint(original).fingerprint;
  const result = guardAcceptanceChange(original, latest, fingerprint);
  assert.equal(result.ok, true);
  assert.equal(result.delta.summary.total, 1);
});

test('wrong fingerprint stops change acceptance', () => {
  const result = guardAcceptanceChange(base(), changed({ state: 'FAIL' }), 'sha256:incorrect');
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.code === 'BASE_MISMATCH'));
  assert.equal(result.delta, null);
});

test('invalid future snapshot is not covered by a fingerprint', () => {
  const result = guardAcceptanceChange(base(), changed({ state: true }), acceptanceFingerprint(base()).fingerprint);
  assert.equal(result.ok, false);
  assert.equal(result.delta, null);
});

test('diff index excludes source URL and labels', () => {
  const result = compareAcceptanceLedgers(base(), changed({ evidence: provenance({ source: 'https://example.org/other' }) }));
  const index = acceptanceChangeIndex(result);
  assert.deepEqual(Object.keys(index[0]).sort(), ['checkId', 'kind', 'priority', 'routeId']);
});

test('an invalid comparison has no change index', () => {
  assert.equal(acceptanceChangeIndex({ ok: false }), null);
});

test('the unknown-transition counter counts only that category', () => {
  const result = compareAcceptanceLedgers(base(), changed({ state: 'FAIL', evidence: provenance({ tier: 1 }) }));
  assert.equal(unknownTransitionCount(result), 1);
});

test('invalid comparisons do not report a zero unknown-transition count', () => {
  assert.equal(unknownTransitionCount({ ok: false }), null);
});

test('comparison never mutates either submitted ledger', () => {
  const earlier = base();
  const later = changed({ state: 'PASS' });
  const original = JSON.stringify(earlier);
  const subsequent = JSON.stringify(later);
  compareAcceptanceLedgers(earlier, later);
  assert.equal(JSON.stringify(earlier), original);
  assert.equal(JSON.stringify(later), subsequent);
});

test('the recorded capture date is not automatically a source timestamp', () => {
  const later = ledger({ capturedOn: '2026-11-20', routes: [route({ checks: [check()] })] });
  assert.equal(compareAcceptanceLedgers(base(), later).summary.total, 0);
});

test('an immutable dependency chain retains UNKNOWN throughout comparison', () => {
  const first = base();
  const second = changed({ evidence: provenance({ tier: 'E' }) });
  compareAcceptanceLedgers(first, second);
  assert.equal(first.routes[0].checks[0].state, 'UNKNOWN');
  assert.equal(second.routes[0].checks[0].state, 'UNKNOWN');
});

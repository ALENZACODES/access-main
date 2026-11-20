import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCEPTANCE_KINDS, ACCEPTANCE_STATES,
  ACCEPTANCE_LIMITS, validateAcceptanceText, validateAcceptanceLedger,
  acceptanceSummary, canonicalAcceptanceLedger, acceptanceFingerprint,
  readAcceptanceLedger, serializeAcceptanceLedger,
} from './offline-acceptance-ledger.mjs';

import { ledger, route, check, provenance, TODAY } from './offline-acceptance-fixtures.mjs';
const codes = (value) => value.problems.map((problem) => problem.code);
const verify = (value, expected, options) => {
  const actual = validateAcceptanceLedger(value, options);
  assert.ok(codes(actual).includes(expected), JSON.stringify(actual.problems));
};

test('ledger vocabulary explicitly distinguishes PASS FAIL and UNKNOWN', () => {
  assert.deepEqual(ACCEPTANCE_STATES, ['PASS', 'FAIL', 'UNKNOWN']);
  assert.equal(ACCEPTANCE_KINDS.includes('keyboard'), true);
  assert.equal(ACCEPTANCE_KINDS.includes('privacy-export'), true);
  assert.equal(ACCEPTANCE_KINDS.includes('asset-integrity'), true);
  assert.equal(new Set(ACCEPTANCE_KINDS).size, ACCEPTANCE_KINDS.length);
});

test('a synthetic UNKNOWN check with provenance is accepted without promotion', () => {
  const input = ledger();
  const result = validateAcceptanceLedger(input);
  assert.equal(result.ok, true);
  assert.equal(result.ledger.routes[0].checks[0].state, 'UNKNOWN');
  assert.equal(input.routes[0].checks[0].state, 'UNKNOWN');
});

test('empty ledger is structurally valid but has no evidence', () => {
  const result = validateAcceptanceLedger(ledger({ routes: [] }));
  assert.equal(result.ok, true);
  const summary = acceptanceSummary(ledger({ routes: [] }));
  assert.equal(summary.summary.checks, 0);
  assert.equal(summary.summary.routeCount, 0);
});

test('an empty route can be indexed but is not regarded as reviewed', () => {
  const result = acceptanceSummary(ledger({ routes: [route({ checks: [] })] }));
  assert.equal(result.ok, true);
  assert.equal(result.summary.routes[0].needsHumanReview, true);
});

test('recorded PASS is a test-result state, not a real-place conclusion', () => {
  const result = acceptanceSummary(ledger({ routes: [route({ checks: [check({ state: 'PASS' })] })] }));
  assert.equal(result.summary.states.PASS, 1);
  assert.equal(result.summary.routes[0].needsHumanReview, false);
});

test('recorded FAIL demands human review', () => {
  const result = acceptanceSummary(ledger({ routes: [route({ checks: [check({ state: 'FAIL' })] })] }));
  assert.equal(result.summary.states.FAIL, 1);
  assert.equal(result.summary.needsHumanReview, true);
});

test('UNKNOWN never becomes PASS after summary', () => {
  const original = ledger();
  const result = acceptanceSummary(original);
  assert.equal(result.summary.states.UNKNOWN, 1);
  assert.equal(result.summary.states.PASS, 0);
  assert.equal(original.routes[0].checks[0].state, 'UNKNOWN');
});

test('invalid root values are refused', () => {
  for (const input of [null, [], 'a', 1, true, undefined]) {
    verify(input, 'LEDGER_INVALID');
  }
});

test('missing or incorrect schema version is refused', () => {
  for (const value of [0, 2, '1', null, undefined]) {
    verify(ledger({ version: value }), 'VERSION_INVALID');
  }
});

test('calendar date must be exact ISO day', () => {
  for (const value of ['2025-02-29', '2026-02-30', '2026-13-01',
    '2026-1-2', 'tomorrow', '2026-11-19T00:00:00Z', undefined]) {
    verify(ledger({ capturedOn: value }), 'CAPTURE_DATE_INVALID');
  }
});

test('valid leap-year capture is supported', () => {
  const sample = ledger({ capturedOn: '2024-02-29',
    routes: [route({ checks: [check({ evidence: provenance({ retrievedOn: '2024-02-29' }) })] })] });
  assert.equal(validateAcceptanceLedger(sample).ok, true);
});

test('future capture dates are rejected with an explicit reference date', () => {
  verify(ledger({ capturedOn: '2026-11-20' }), 'CAPTURE_DATE_INVALID', { today: TODAY });
});

test('the checker has no implicit clock and permits dated offline review', () => {
  const sample = ledger({ capturedOn: '2030-01-01',
    routes: [route({ checks: [check({ evidence: provenance({ retrievedOn: TODAY }) })] })] });
  assert.equal(validateAcceptanceLedger(sample).ok, true);
});

test('routes property is required to be an array', () => {
  for (const input of [null, {}, 'sample', undefined]) {
    verify(ledger({ routes: input }), 'ROUTES_REQUIRED');
  }
});

test('route records must be objects', () => {
  for (const input of [null, true, 3, 'route', []]) {
    verify(ledger({ routes: [input] }), 'ROUTE_INVALID');
  }
});

test('route identity must be safe and stable', () => {
  for (const id of ['', null, '__proto__', 'constructor', 'a/b', 123]) {
    verify(ledger({ routes: [route({ id })] }), 'ROUTE_ID_INVALID');
  }
});

test('valid nested paths are accepted', () => {
  for (const path of ['/', '/example', '/example/second', '/example-1', '/fr/page_2']) {
    assert.equal(validateAcceptanceLedger(ledger({ routes: [route({ path })] })).ok, true, path);
  }
});

test('invalid path separators and traversal are rejected', () => {
  for (const path of ['', 'relative', 'https://example.org', '/a//b',
    '/../secret', '/a/../b', '/a#fragment', '/a?query', null]) {
    verify(ledger({ routes: [route({ path })] }), 'ROUTE_PATH_INVALID');
  }
});

test('duplicate route identifiers are not silently merged', () => {
  verify(ledger({ routes: [route(), route({ path: '/different' })] }), 'ROUTE_DUPLICATE');
});

test('duplicate paths are not silently merged', () => {
  verify(ledger({ routes: [route(), route({ id: 'different' })] }), 'PATH_DUPLICATE');
});

test('check list must be an array', () => {
  for (const checks of [null, {}, 'checks', undefined]) {
    verify(ledger({ routes: [route({ checks })] }), 'CHECKS_REQUIRED');
  }
});

test('all supported technical check kinds are accepted', () => {
  for (const kind of ACCEPTANCE_KINDS) {
    assert.equal(validateAcceptanceLedger(ledger({ routes: [route({ checks: [check({ kind })] })] })).ok, true, kind);
  }
});

test('unknown kind values fail closed', () => {
  for (const kind of ['real-place-certified', 'unknown', '', null, 10]) {
    verify(ledger({ routes: [route({ checks: [check({ kind })] })] }), 'KIND_INVALID');
  }
});

test('unknown test-result states are invalid rather than guessed', () => {
  for (const state of ['yes', 'pass', 'accessible', 'UNKNOWN ', true, null, undefined]) {
    verify(ledger({ routes: [route({ checks: [check({ state })] })] }), 'STATE_INVALID');
  }
});

test('no boolean is accepted as a test state', () => {
  for (const state of [true, false]) {
    verify(ledger({ routes: [route({ checks: [check({ state })] })] }), 'STATE_INVALID');
  }
});

test('duplicate check IDs within a route are refused', () => {
  verify(ledger({ routes: [route({ checks: [check(), check()] })] }), 'CHECK_DUPLICATE');
});

test('the same check ID can occur on different routes', () => {
  const sample = ledger({ routes: [route(), route({ id: 'second', path: '/second' })] });
  assert.equal(validateAcceptanceLedger(sample).ok, true);
});

test('check IDs reject protocol-looking keys and separators', () => {
  for (const id of ['__proto__', 'prototype', 'constructor', 'a/b', '']) {
    verify(ledger({ routes: [route({ checks: [check({ id })] })] }), 'CHECK_ID_INVALID');
  }
});

test('every recorded check requires a source URL', () => {
  for (const source of [null, 'http://example.org', 'file:///tmp/result',
    'javascript:alert(1)', 'https://username:password@example.org',
    'https://localhost/log', '', 'https://127.0.0.1/log']) {
    verify(ledger({ routes: [route({ checks: [check({ evidence: provenance({ source }) })] })] }), 'SOURCE_INVALID');
  }
});

test('open source URL remains inert and is never fetched', () => {
  const sample = ledger();
  const serialized = serializeAcceptanceLedger(sample);
  assert.equal(serialized.ok, true);
  assert.ok(serialized.text.includes('https://example.org/release-evidence'));
});

test('licence must be explicitly accepted', () => {
  for (const licence of ['all rights reserved', 'open', '', null, undefined, 'CC-BY-9.0']) {
    verify(ledger({ routes: [route({ checks: [check({ evidence: provenance({ licence }) })] })] }), 'LICENCE_INVALID');
  }
});

test('accepted licence identifiers do not imply trust in source contents', () => {
  for (const licence of ['CC0-1.0', 'CC-BY-4.0', 'OGL-Ontario-1.0', 'Apache-2.0']) {
    assert.equal(validateAcceptanceLedger(ledger({ routes: [route({ checks: [check({ evidence: provenance({ licence }) })] })] })).ok, true);
  }
});

test('retrieval dates must be real days', () => {
  for (const retrievedOn of ['', '2026-02-30', '2026-11-19T12:00:00Z', null]) {
    verify(ledger({ routes: [route({ checks: [check({ evidence: provenance({ retrievedOn }) })] })] }), 'RETRIEVAL_INVALID');
  }
});

test('retrieval dates cannot postdate capture date', () => {
  verify(ledger({ routes: [route({ checks: [check({ evidence: provenance({ retrievedOn: '2026-11-20' }) })] })] }), 'RETRIEVAL_INVALID');
});

test('UNKNOWN is a claim-state token, never a verification tier', () => {
  for (const tier of ['UNKNOWN', 'unknown', null, 5, '5']) {
    verify(ledger({ routes: [route({ checks: [check({ evidence: provenance({ tier }) })] })] }), 'TIER_INVALID');
  }
});

test('canonical numeric and administrator page tiers are accepted as metadata only', () => {
  for (const tier of [0, 1, 2, 3, 4, 'E']) {
    assert.equal(validateAcceptanceLedger(ledger({ routes: [route({ checks: [check({ evidence: provenance({ tier }) })] })] })).ok, true);
  }
});

test('every result requires run identity and SHA-256', () => {
  verify(ledger({ routes: [route({ checks: [check({ evidence: provenance({ runId: '' }) })] })] }), 'RUN_ID_INVALID');
  verify(ledger({ routes: [route({ checks: [check({ evidence: provenance({ artifactSha256: 'bad' }) })] })] }), 'DIGEST_INVALID');
});

test('digest format is exactly 64 hex characters', () => {
  for (const digest of ['a'.repeat(63), 'z'.repeat(64), 'A'.repeat(65), '', null]) {
    verify(ledger({ routes: [route({ checks: [check({ evidence: provenance({ artifactSha256: digest }) })] })] }), 'DIGEST_INVALID');
  }
});

test('uppercase SHA-256 hex is accepted and canonicalization preserves it', () => {
  const sample = ledger({ routes: [route({ checks: [check({ evidence: provenance({ artifactSha256: 'A'.repeat(64) }) })] })] });
  assert.equal(canonicalAcceptanceLedger(sample).canonical.routes[0].checks[0].evidence.artifactSha256, 'A'.repeat(64));
});

test('bilingual labels are required for route and check', () => {
  verify(ledger({ routes: [route({ label: { en: 'English' } })] }), 'FR_REQUIRED');
  verify(ledger({ routes: [route({ checks: [check({ label: { fr: 'Français' } })] })] }), 'EN_REQUIRED');
});

test('French punctuation accepts correct colon and narrow spaces', () => {
  assert.deepEqual(validateAcceptanceText({ en: 'Title', fr: 'Source\u00A0: «\u202Fexemple\u202F»\u202F!' }), []);
});

test('French colons need ordinary no-break space', () => {
  assert.ok(validateAcceptanceText({ en: 'Title', fr: 'Source : exemple' }).some((p) => p.code === 'FR_COLON'));
  assert.ok(validateAcceptanceText({ en: 'Title', fr: 'Source\u202F: exemple' }).some((p) => p.code === 'FR_COLON'));
});

test('French question and exclamation marks need narrow no-break space', () => {
  for (const fr of ['Question ?', 'Attention !', 'Question\u00A0?']) {
    assert.ok(validateAcceptanceText({ en: 'Title', fr }).some((p) => p.code === 'FR_NARROW'));
  }
});

test('French semicolons and guillemets require narrow no-break space', () => {
  for (const fr of ['A ; B', '«A»', '«\u00A0A\u00A0»']) {
    assert.ok(validateAcceptanceText({ en: 'Title', fr }).length > 0);
  }
});

test('French straight apostrophes are flagged within words', () => {
  assert.ok(validateAcceptanceText({ en: 'Title', fr: "L'application" }).some((p) => p.code === 'FR_APOSTROPHE'));
  assert.deepEqual(validateAcceptanceText({ en: 'Title', fr: 'L’application' }), []);
});

test('optional notes require bilingual labels', () => {
  verify(ledger({ routes: [route({ checks: [check({ note: { en: 'Note' } })] })] }), 'FR_REQUIRED');
});

test('an optional review link must be a safe identifier', () => {
  verify(ledger({ routes: [route({ checks: [check({ reviewItemId: '../bad' })] })] }), 'REVIEW_ID_INVALID');
});

test('privacy-sensitive fields are rejected and never echoed', () => {
  const sample = ledger({ routes: [route({ checks: [check({ token: 'private-value-123' })] })] });
  const result = validateAcceptanceLedger(sample);
  assert.ok(codes(result).includes('PRIVATE_FIELD'));
  assert.ok(!JSON.stringify(result.problems).includes('private-value-123'));
});

test('extra fields are fail-closed', () => {
  verify({ ...ledger(), extra: 'not part of contract' }, 'EXTRA_FIELD');
  verify(ledger({ routes: [route({ extra: 'not allowed' })] }), 'EXTRA_FIELD');
  verify(ledger({ routes: [route({ checks: [check({ extra: true })] })] }), 'EXTRA_FIELD');
});

test('null prototype objects can be inspected without crashing', () => {
  const sample = Object.assign(Object.create(null), ledger());
  assert.equal(validateAcceptanceLedger(sample).ok, true);
});

test('cycle detection rejects cyclic structures without leaking objects', () => {
  const sample = ledger();
  sample.self = sample;
  verify(sample, 'CYCLIC_DATA');
});

test('resource limit overrides must be bounded positive integers', () => {
  for (const maxRoutes of [0, -1, 1.5, 1_000_000, null]) {
    verify(ledger(), 'LIMIT_INVALID', { maxRoutes });
  }
});

test('per-route count limits fail without silently truncating acceptance', () => {
  const sample = ledger({ routes: [route(), route({ id: 'two', path: '/two' })] });
  verify(sample, 'ROUTE_LIMIT', { maxRoutes: 1 });
});

test('total check count is bounded', () => {
  const sample = ledger({ routes: [route({ checks: [check(), check({ id: 'second' })] })] });
  verify(sample, 'TOTAL_CHECK_LIMIT', { maxChecks: 1 });
});

test('issue cap cannot silently hide every problem', () => {
  const sample = ledger({ routes: [route({ checks: [check({ state: 'bad' }), check({ id: 'two', state: 'bad' })] })] });
  verify(sample, 'ISSUE_LIMIT', { maxIssues: 1 });
});

test('summary counts are grouped by check kind', () => {
  const sample = ledger({ routes: [route({ checks: [check({ state: 'PASS' }),
    check({ id: 'focus', kind: 'focus-visible', state: 'FAIL' })] })] });
  const summary = acceptanceSummary(sample).summary;
  assert.equal(summary.checks, 2);
  assert.equal(summary.kinds.keyboard.PASS, 1);
  assert.equal(summary.kinds['focus-visible'].FAIL, 1);
});

test('invalid summary has no counts', () => {
  const sample = ledger({ routes: [route({ checks: [check({ state: true })] })] });
  assert.equal(acceptanceSummary(sample).summary, null);
});

test('canonical serialization sorts routes and checks deterministically', () => {
  const a = ledger({ routes: [route({ id: 'b', path: '/b', checks: [check({ id: 'z' }), check({ id: 'a' })] }),
    route({ id: 'a', path: '/a' })] });
  const b = ledger({ routes: [route({ id: 'a', path: '/a' }),
    route({ id: 'b', path: '/b', checks: [check({ id: 'a' }), check({ id: 'z' })] })] });
  assert.equal(serializeAcceptanceLedger(a).text, serializeAcceptanceLedger(b).text);
  assert.equal(acceptanceFingerprint(a).fingerprint, acceptanceFingerprint(b).fingerprint);
});

test('changing a reported test state changes its fingerprint', () => {
  const a = ledger();
  const b = ledger({ routes: [route({ checks: [check({ state: 'FAIL' })] })] });
  assert.notEqual(acceptanceFingerprint(a).fingerprint, acceptanceFingerprint(b).fingerprint);
});

test('a fingerprint is SHA-256 of canonical data, not a signature', () => {
  const result = acceptanceFingerprint(ledger());
  assert.match(result.fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test('malformed JSON fails without exposing input content', () => {
  const value = readAcceptanceLedger('{ private-secret');
  assert.ok(codes(value).includes('JSON_INVALID'));
  assert.ok(!JSON.stringify(value).includes('private-secret'));
});

test('oversized JSON is refused before parsing', () => {
  assert.ok(codes(readAcceptanceLedger(' '.repeat(ACCEPTANCE_LIMITS.maxBytes + 1))).includes('INPUT_LIMIT'));
});

test('normalizing JSON does not infer missing claims', () => {
  const sample = ledger();
  const result = readAcceptanceLedger(JSON.stringify(sample));
  assert.equal(result.ok, true);
  assert.equal(result.ledger.routes[0].checks[0].state, 'UNKNOWN');
});

test('invalid data never generates a canonical export', () => {
  const sample = ledger({ routes: [route({ checks: [check({ state: 'YES' })] })] });
  assert.equal(serializeAcceptanceLedger(sample).text, null);
});

test('serialized result can be parsed and compared with the original', () => {
  const sample = ledger();
  const text = serializeAcceptanceLedger(sample).text;
  assert.deepEqual(readAcceptanceLedger(text).ledger, sample);
});


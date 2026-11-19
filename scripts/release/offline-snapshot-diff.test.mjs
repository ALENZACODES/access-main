import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CLAIM_STATES, REVIEW_KINDS, DEFAULT_LIMITS, isPlainObject, firstValue,
  validDay, dateFromTimestamp, safeSource, openLicence, canonicalTier,
  normalizeState, sourceMetadata, privateFields, snapshotRecords,
  recordPayload, recordIdentity, recordClaims, validateSnapshot,
  metadataSame, claimDiff, compareSnapshots, textFor, formatMetadata,
  formatTextReport, runCli,
} from './offline-snapshot-diff.mjs';

const META = Object.freeze({
  source: 'https://data.example.org/record',
  licence: 'CC-BY-4.0',
  retrievedOn: '2026-11-19',
  tier: 0,
});
const record = (id = 'place-1', state = 'UNKNOWN', overrides = {}) => ({
  id, stepFreeEntrance: { state }, ...META, ...overrides,
});
const snapshot = (...records) => ({ records });
const codes = (result) => result.problems.map((entry) => entry.code);

// An offline review must accept only the documented, conservative states.
test('supported states do not include inferred booleans', () => {
  assert.deepEqual(CLAIM_STATES, ['YES', 'NO', 'UNKNOWN']);
  assert.equal(normalizeState(true), null);
  assert.equal(normalizeState(false), null);
  assert.equal(normalizeState('yes'), null);
  assert.equal(normalizeState('UNKNOWN'), 'UNKNOWN');
  assert.equal(normalizeState({ state: 'NO' }), 'NO');
  assert.equal(normalizeState({ value: 'YES' }), 'YES');
  assert.equal(normalizeState({ state: 'INFERRED' }), null);
  assert.equal(normalizeState({}), null);
  assert.equal(normalizeState(null), null);
});

test('review vocabulary has stable change names', () => {
  assert.equal(new Set(REVIEW_KINDS).size, REVIEW_KINDS.length);
  assert.ok(REVIEW_KINDS.includes('evidence-lost'));
  assert.ok(REVIEW_KINDS.includes('unknown-transition'));
});

test('plain objects exclude null, array, and class instances', () => {
  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject(Object.create(null)), true);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(new Date()), false);
});

test('metadata keys prefer explicit first choice', () => {
  assert.equal(firstValue({ source: 'first', sourceUrl: 'second' }, ['source', 'sourceUrl']), 'first');
  assert.equal(firstValue({ sourceUrl: 'second' }, ['source', 'sourceUrl']), 'second');
  assert.equal(firstValue({}, ['source']), undefined);
  assert.equal(firstValue(null, ['source']), undefined);
});

test('calendar validation rejects rollover and malformed dates', () => {
  assert.equal(validDay('2024-02-29'), true);
  for (const value of ['2025-02-29', '2026-13-01', '2026-00-01', '2026-04-31',
    '2026-11-19T00:00:00Z', '2026-1-2', 'today', '', null, undefined]) {
    assert.equal(validDay(value), false, `${value}`);
  }
});

test('retrieval timestamps are parsed as ISO and not guessed', () => {
  assert.equal(dateFromTimestamp('2026-11-19'), '2026-11-19');
  assert.equal(dateFromTimestamp('2026-11-19T23:45:00Z'), '2026-11-19');
  assert.equal(dateFromTimestamp('2026-11-19T23:45:00-05:00'), '2026-11-20');
  for (const value of ['yesterday', 123, '', '2026-11-19T23:45', '2026-02-30']) {
    assert.equal(dateFromTimestamp(value), null, `${value}`);
  }
});

test('only safe https source URLs are admitted', () => {
  assert.equal(safeSource('https://data.example.org/record'), true);
  for (const url of ['http://example.org', 'javascript:alert(1)', 'file:///tmp/report',
    'https://user:pass@example.org', 'https://localhost/private',
    'https://127.0.0.1/path', 'https://[::1]/', 'https://example.org/#secret',
    'nonsense', '', null]) {
    assert.equal(safeSource(url), false, `${url}`);
  }
});

test('open licence requires explicit accepted identifier', () => {
  assert.equal(openLicence('CC-BY-4.0'), true);
  assert.equal(openLicence('OGL-Canada-3.0'), true);
  assert.equal(openLicence('ODbL-1.0'), true);
  for (const value of ['All rights reserved', 'Open', 'Proprietary', '', undefined]) {
    assert.equal(openLicence(value), false, `${value}`);
  }
});

test('canonical tier translation leaves unrecognized labels unknown', () => {
  assert.equal(canonicalTier(0), 0);
  assert.equal(canonicalTier('E'), 'E');
  assert.equal(canonicalTier('administrator_page'), 'E');
  assert.equal(canonicalTier('tier-2-peer'), 2);
  for (const value of [null, undefined, 'UNKNOWN', 'verified', 5, '5', '']) {
    assert.equal(canonicalTier(value), null, `${value}`);
  }
});

test('claim metadata overrides parent metadata without arbitrary truth escalation', () => {
  const rec = record('x', 'UNKNOWN', { provenance: { source: 'https://example.org/common' } });
  assert.equal(sourceMetadata(rec).source, 'https://example.org/common');
  assert.equal(sourceMetadata(rec, { source: 'https://example.org/field' }).source, 'https://example.org/field');
  assert.equal(sourceMetadata(rec).tier, 0);
  assert.equal(sourceMetadata(rec).retrievedOn, META.retrievedOn);
});

test('private field walk reports key paths without exposing their values', () => {
  const input = { rows: [{ token: 'secret-value', detail: { health_card: '123' } }] };
  const findings = privateFields(input);
  assert.ok(findings.some((entry) => entry.path === '/rows/0/token'));
  assert.ok(findings.some((entry) => entry.path === '/rows/0/detail/health_card'));
  assert.ok(!JSON.stringify(findings).includes('secret-value'));
});

test('private field walk safely detects object cycles and depth', () => {
  const value = { id: 'one' };
  value.self = value;
  assert.ok(privateFields(value).some((item) => item.code === 'CYCLIC_DATA'));
});

test('supported record collections and standalone feature', () => {
  const list = [record()];
  assert.equal(snapshotRecords(list), list);
  assert.equal(snapshotRecords({ places: list }), list);
  assert.equal(snapshotRecords({ locations: list }), list);
  assert.equal(snapshotRecords({ features: list }), list);
  assert.equal(snapshotRecords({ type: 'Feature', id: 'a', properties: {} }).length, 1);
  assert.equal(snapshotRecords({ garbage: list }), null);
});

test('GeoJSON feature properties are read without inferring geometry accessibility', () => {
  const feature = {
    type: 'Feature', id: 'feature-1', geometry: { type: 'Point', coordinates: [-79, 43] },
    properties: { stepFreeEntrance: { state: 'UNKNOWN' }, ...META },
  };
  assert.equal(recordIdentity(feature), 'feature-1');
  assert.equal(recordClaims(feature).length, 1);
  assert.equal(recordPayload(feature).id, 'feature-1');
  assert.equal(validateSnapshot({ type: 'FeatureCollection', features: [feature] }).ok, true);
});

test('record identity never substitutes array index', () => {
  assert.equal(recordIdentity({ name: 'Sample' }), null);
  assert.equal(recordIdentity({ id: 'real-id' }), 'real-id');
  assert.equal(recordIdentity({ id: '' }), null);
  assert.equal(recordIdentity({ id: 123 }), null);
});

test('nested claims recognized; unrelated fields ignored', () => {
  const value = record('n', 'UNKNOWN', { fields: { accessibleWashroom: { state: 'NO' }, arbitrary: true } });
  assert.deepEqual(recordClaims(value).map((claim) => claim.name).sort(), ['accessibleWashroom', 'stepFreeEntrance']);
});

test('empty collection is valid and contains no invented records', () => {
  const result = validateSnapshot(snapshot());
  assert.equal(result.ok, true);
  assert.equal(result.records.size, 0);
});

test('records require stable unique identity', () => {
  assert.ok(codes(validateSnapshot(snapshot({ ...META, stepFreeEntrance: 'UNKNOWN' }))).includes('RECORD_ID'));
  assert.ok(codes(validateSnapshot(snapshot(record('dup'), record('dup')))).includes('DUPLICATE_ID'));
});

test('records with no claims still need source, licence, date, and tier', () => {
  const result = validateSnapshot(snapshot({ id: 'empty-record' }));
  for (const code of ['SOURCE_REQUIRED', 'OPEN_LICENCE_REQUIRED',
    'RETRIEVAL_DATE_REQUIRED', 'TIER_REQUIRED']) {
    assert.ok(codes(result).includes(code), code);
  }
});

test('a provenance-complete record with no accessibility claim remains empty', () => {
  const result = validateSnapshot(snapshot({ id: 'empty-record', ...META }));
  assert.equal(result.ok, true);
  assert.equal(result.records.get('empty-record').claims.size, 0);
});

test('invalid state is rejected instead of becoming Unknown', () => {
  assert.ok(codes(validateSnapshot(snapshot(record('a', true)))).includes('INVALID_STATE'));
});

test('every claim requires its own or inherited complete provenance', () => {
  const result = validateSnapshot(snapshot({
    id: 'missing', stepFreeEntrance: 'UNKNOWN', source: 'https://example.org',
  }));
  for (const code of ['OPEN_LICENCE_REQUIRED', 'RETRIEVAL_DATE_REQUIRED', 'TIER_REQUIRED']) {
    assert.ok(codes(result).includes(code), code);
  }
});

test('missing source rejects even the Unknown state', () => {
  const result = validateSnapshot(snapshot(record('a', 'UNKNOWN', { source: null })));
  assert.ok(codes(result).includes('SOURCE_REQUIRED'));
});

test('unsupported licence does not get treated as open', () => {
  assert.ok(codes(validateSnapshot(snapshot(record('a', 'UNKNOWN', { licence: 'private' })))).includes('OPEN_LICENCE_REQUIRED'));
});

test('invalid date and invalid tier are not silently normalized', () => {
  const result = validateSnapshot(snapshot(record('a', 'UNKNOWN', { retrievedOn: '2026-02-30', tier: 'UNKNOWN' })));
  assert.ok(codes(result).includes('RETRIEVAL_DATE_REQUIRED'));
  assert.ok(codes(result).includes('TIER_REQUIRED'));
});

test('private keys cause the whole snapshot to fail closed', () => {
  const result = validateSnapshot(snapshot(record('a', 'UNKNOWN', { password: 'not-for-export' })));
  assert.ok(codes(result).includes('PRIVATE_FIELD'));
});

test('record count and claim limits can be tightened', () => {
  assert.ok(codes(validateSnapshot(snapshot(record('a'), record('b')), { maxRecords: 1 })).includes('RECORD_LIMIT'));
  assert.ok(codes(validateSnapshot(snapshot(record('a')), { maxFields: 0 })).includes('CLAIM_LIMIT'));
});

test('metadata equality compares all supported provenance dimensions', () => {
  assert.equal(metadataSame(META, { ...META }), true);
  assert.equal(metadataSame(META, { ...META, retrievedOn: '2026-11-20' }), false);
});

test('identical snapshots yield no changes', () => {
  const result = compareSnapshots(snapshot(record()), snapshot(record()));
  assert.equal(result.ok, true);
  assert.equal(result.summary.changes, 0);
  assert.deepEqual(result.changes, []);
});

test('new and missing records are explicit and deterministic', () => {
  const result = compareSnapshots(snapshot(record('old')), snapshot(record('new')));
  assert.equal(result.ok, true);
  assert.deepEqual(result.changes.filter((entry) => entry.field === null).map((entry) => entry.kind), ['added', 'removed']);
  assert.deepEqual(result.changes.map((entry) => entry.id), ['new', 'new', 'old', 'old']);
});

test('affirmative to Unknown is flagged rather than treated as an accessibility fact', () => {
  const result = compareSnapshots(snapshot(record('a', 'YES')), snapshot(record('a', 'UNKNOWN')));
  assert.deepEqual(result.changes.map((entry) => entry.kind), ['unknown-transition']);
  assert.equal(result.changes[0].after.state, 'UNKNOWN');
});

test('Unknown to affirmative is flagged for review, not automatically approved', () => {
  const result = compareSnapshots(snapshot(record('a', 'UNKNOWN')), snapshot(record('a', 'YES')));
  assert.deepEqual(result.changes.map((entry) => entry.kind), ['unknown-transition']);
});

test('a direct YES to NO change receives explicit changed label', () => {
  const result = compareSnapshots(snapshot(record('a', 'YES')), snapshot(record('a', 'NO')));
  assert.deepEqual(result.changes.map((entry) => entry.kind), ['changed']);
});

test('metadata changes are independently reported', () => {
  const result = compareSnapshots(snapshot(record('a')), snapshot(record('a', 'UNKNOWN', {
    source: 'https://other.example.org', retrievedOn: '2026-11-20', tier: 1,
  })));
  assert.deepEqual(result.changes.map((entry) => entry.kind), ['source-changed', 'date-changed', 'tier-changed']);
});

test('invalid later snapshot cannot produce a seemingly clean review', () => {
  const result = compareSnapshots(snapshot(record('a')), snapshot(record('a', 'YES', { licence: null })));
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.equal(result.changes.length, 0);
  assert.equal(result.problems[0].snapshot, 'later');
});

test('invalid earlier snapshot is also rejected', () => {
  const result = compareSnapshots(snapshot(record('a', 'INVALID')), snapshot(record('a')));
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((entry) => entry.snapshot === 'earlier'));
});

test('comparison is stable across different input ordering', () => {
  const left = compareSnapshots(snapshot(record('z'), record('a')), snapshot(record('z', 'YES'), record('a', 'NO')));
  const right = compareSnapshots(snapshot(record('a'), record('z')), snapshot(record('a', 'NO'), record('z', 'YES')));
  assert.deepEqual(left, right);
});

test('English and French report headings are available', () => {
  for (const locale of ['en', 'fr']) {
    assert.ok(textFor(locale).title);
    assert.ok(textFor(locale).caution);
    for (const kind of REVIEW_KINDS) assert.ok(textFor(locale)[kind], `${locale}:${kind}`);
  }
});

test('French typography does not contain ASCII space before question/exclamation/colon', () => {
  const entries = Object.values(textFor('fr'));
  for (const entry of entries) {
    assert.equal(/ [?!:]/u.test(entry), false, entry);
  }
  assert.equal(formatTextReport(compareSnapshots(snapshot(record()), snapshot(record())), 'fr').includes('Unknown'), false);
});

test('rendered French report inserts nonbreaking spaces before colons', () => {
  const result = compareSnapshots(snapshot(record('a', 'UNKNOWN')), snapshot(record('a', 'YES')));
  const output = formatTextReport(result, 'fr');
  assert.ok(output.includes('Source\u00a0:'));
  assert.ok(output.includes('Fiche\u00a0:'));
  assert.equal(/(?<!\u00a0):/u.test(output.replace(/https:\/\/[^\s|]+/g, 'URL')), false);
});

test('report cautions stay present even on no changes', () => {
  const result = compareSnapshots(snapshot(record()), snapshot(record()));
  for (const locale of ['en', 'fr']) {
    const output = formatTextReport(result, locale);
    assert.ok(output.includes(textFor(locale).caution));
    assert.ok(output.includes(textFor(locale).noChanges));
  }
});

test('report shows claim values and complete source metadata', () => {
  const result = compareSnapshots(snapshot(record('a', 'UNKNOWN')), snapshot(record('a', 'YES')));
  const output = formatTextReport(result);
  assert.ok(output.includes('UNKNOWN'));
  assert.ok(output.includes('YES'));
  assert.ok(output.includes(META.source));
  assert.ok(output.includes(META.licence));
  assert.ok(output.includes(META.retrievedOn));
  assert.ok(formatMetadata(null, 'fr').includes('Inconnu'));
});

test('invalid report lists issue codes but never includes raw private values', () => {
  const result = compareSnapshots(snapshot(record('a', 'UNKNOWN', { token: 'private-secret-123' })), snapshot());
  const output = formatTextReport(result);
  assert.ok(output.includes('PRIVATE_FIELD'));
  assert.ok(!output.includes('private-secret-123'));
});

test('JSON serialization does not include unrelated record data', () => {
  const result = compareSnapshots(snapshot(record('a', 'UNKNOWN', { title: 'Unrelated label' })), snapshot(record('a', 'YES')));
  assert.ok(!JSON.stringify(result).includes('Unrelated label'));
});

test('CLI works against two saved snapshots without network', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'snapshot-review-'));
  const earlier = join(dir, 'earlier.json');
  const later = join(dir, 'later.json');
  await writeFile(earlier, JSON.stringify(snapshot(record('a'))));
  await writeFile(later, JSON.stringify(snapshot(record('a', 'YES'))));
  const chunks = [];
  const errors = [];
  const code = await runCli(['--earlier', earlier, '--later', later, '--locale', 'fr'], {
    stdout: { write: (part) => chunks.push(part) },
    stderr: { write: (part) => errors.push(part) },
  });
  assert.equal(code, 0);
  assert.equal(errors.length, 0);
  assert.ok(chunks.join('').includes('Inconnu'));
});

test('CLI write is create-only and cannot overwrite an existing output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'snapshot-review-'));
  const earlier = join(dir, 'earlier.json');
  const later = join(dir, 'later.json');
  const output = join(dir, 'review.json');
  await writeFile(earlier, JSON.stringify(snapshot(record('a'))));
  await writeFile(later, JSON.stringify(snapshot(record('a'))));
  await writeFile(output, 'do not overwrite');
  const chunks = [];
  const code = await runCli(['--earlier', earlier, '--later', later, '--output', output], {
    stderr: { write: (part) => chunks.push(part) },
  });
  assert.equal(code, 2);
  assert.equal(await readFile(output, 'utf8'), 'do not overwrite');
});

test('CLI malformed input fails and does not write report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'snapshot-review-'));
  const earlier = join(dir, 'earlier.json');
  const later = join(dir, 'later.json');
  await writeFile(earlier, '{');
  await writeFile(later, JSON.stringify(snapshot()));
  const errors = [];
  const code = await runCli(['--earlier', earlier, '--later', later], {
    stderr: { write: (part) => errors.push(part) },
  });
  assert.equal(code, 2);
  assert.ok(errors[0].includes('failed'));
});

test('CLI rejects unexpected arguments and unsupported locale', async () => {
  const errors = [];
  assert.equal(await runCli(['--unknown', 'arg'], { stderr: { write: (value) => errors.push(value) } }), 2);
  assert.equal(await runCli(['--earlier', 'a', '--later', 'b', '--locale', 'zz'], {
    stderr: { write: (value) => errors.push(value) },
  }), 2);
});

test('module also executes as a direct CLI', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'snapshot-review-'));
  const earlier = join(dir, 'earlier.json');
  const later = join(dir, 'later.json');
  await writeFile(earlier, JSON.stringify(snapshot()));
  await writeFile(later, JSON.stringify(snapshot(record('a'))));
  const result = spawnSync(process.execPath, [new URL('./offline-snapshot-diff.mjs', import.meta.url).pathname,
    '--earlier', earlier, '--later', later, '--format', 'json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test('default limits are bounded', () => {
  assert.ok(DEFAULT_LIMITS.maxBytes < 50_000_000);
  assert.ok(DEFAULT_LIMITS.maxRecords > 0);
  assert.ok(DEFAULT_LIMITS.maxIssues > 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conservativeClaim, inspectOfflineSnapshot, inspectRecord,
  offlineRecordPolicy, parseOfflineSnapshot,
} from './offline-record-integrity.mjs';

const good = () => ({
  id: 'fixture-one',
  name: { en: 'Sample site', fr: 'Lieu fictif' },
  description: { en: 'Data supplied for local testing.', fr: 'Données fictives pour essai.' },
  source: 'Local fixture, not a real place',
  licence: 'CC0-1.0',
  retrievedOn: '2026-11-19',
  verificationTier: 'PROTOTYPE-UNVERIFIED',
  claims: { stepFreeEntrance: 'unknown', toilet: 'unknown' },
});

function codes(result) { return result.issues.map(({ code }) => code); }

test('accepts a local synthetic fixture without inventing access facts', () => {
  const result = inspectOfflineSnapshot({ records: [good()] }, { today: '2026-11-19' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.records[0].claims, { stepFreeEntrance: 'unknown', toilet: 'unknown' });
});

test('does not mutate original data', () => {
  const input = good();
  const result = inspectRecord(input);
  assert.notEqual(result.normalized, input);
  assert.notEqual(result.normalized.claims, input.claims);
  assert.equal(input.claims.toilet, 'unknown');
});

test('fails closed when provenance is missing even if claim says yes', () => {
  const record = { ...good(), source: '', claims: { ramp: 'yes', toilet: true } };
  const result = inspectRecord(record);
  assert.ok(codes(result).includes('PROVENANCE_MISSING'));
  assert.equal(result.normalized.claims.ramp, 'unknown');
  assert.equal(result.normalized.claims.toilet, 'unknown');
});

test('rejects impossible dates and future retrievals', () => {
  assert.ok(codes(inspectRecord({ ...good(), retrievedOn: '2026-02-30' }))
    .includes('DATE_INVALID'));
  assert.ok(codes(inspectRecord({ ...good(), retrievedOn: '2026-11-20' },
    0, { today: '2026-11-19' })).includes('FUTURE_RETRIEVAL'));
});

test('rejects HTTP, credentials, control characters and scripting sources', () => {
  for (const source of [
    'http://example.test/page', 'https://person:secret@example.test',
    'javascript:alert(1)', 'Broken\nsource', ' <b>source</b> ',
  ]) {
    assert.ok(codes(inspectRecord({ ...good(), source })).includes('SOURCE_INVALID'), source);
  }
});

test('only allows known tier values', () => {
  const result = inspectRecord({ ...good(), verificationTier: 'FIELD_CONFIRMED' });
  assert.ok(codes(result).includes('TIER_UNKNOWN'));
});

test('requires source, licence, date and tier for every record', () => {
  const record = good();
  for (const key of offlineRecordPolicy.requiredProvenance) delete record[key];
  assert.equal(codes(inspectRecord(record)).filter((c) => c === 'PROVENANCE_MISSING').length, 4);
});

test('rejects duplicate record ids', () => {
  const result = inspectOfflineSnapshot({ records: [good(), good()] });
  assert.ok(codes(result).includes('ID_DUPLICATE'));
});

test('rejects unknown claim vocabulary rather than treating it as yes', () => {
  const result = inspectRecord({ ...good(), claims: { lift: 'probably' } });
  assert.ok(codes(result).includes('CLAIM_VALUE'));
  assert.equal(result.normalized.claims.lift, 'unknown');
});

test('conservativeClaim requires complete provenance', () => {
  assert.equal(conservativeClaim('yes'), 'unknown');
  assert.equal(conservativeClaim('yes', { provenanceComplete: true }), 'yes');
  assert.equal(conservativeClaim('no', { provenanceComplete: true }), 'no');
  assert.equal(conservativeClaim('maybe', { provenanceComplete: true }), 'unknown');
});

test('supports valid French nonbreaking punctuation', () => {
  const result = inspectRecord({ ...good(), description: {
    en: 'Question?', fr: 'Question\u00a0? «\u00a0Oui\u00a0»\u00a0!',
  } });
  assert.equal(result.issues.length, 0);
});

test('detects missing French spacing and paired translation gaps', () => {
  const result = inspectRecord({ ...good(), name: { en: 'Door?', fr: 'Porte?' },
    description: { en: 'Door', fr: '«Entrée»' } });
  assert.ok(codes(result).includes('FR_NBSP'));
  assert.ok(codes(result).includes('FR_GUILLEMETS'));
  assert.ok(codes(inspectRecord({ ...good(), name: { en: 'Only English' } }))
    .includes('LOCALE_MISSING'));
});

test('rejects private fields regardless of the content', () => {
  const result = inspectRecord({ ...good(), contact_email: 'private@example.test',
    metadata: { api_key: 'hidden', session: 'unused' } });
  assert.equal(codes(result).filter((c) => c === 'PRIVATE_FIELD').length, 3);
});

test('catches dangerous object keys and cyclic structures', () => {
  const record = good();
  record.extra = Object.create(null);
  record.extra.constructor = 5;
  record.loop = record;
  const result = inspectRecord(record);
  assert.ok(codes(result).includes('CYCLE'));
  assert.ok(codes(result).includes('OBJECT_SHAPE'));
  assert.ok(codes(result).includes('UNSAFE_KEY'));
});

test('handles invalid JSON and invalid input values', () => {
  assert.ok(codes(parseOfflineSnapshot('{broken')).includes('JSON_PARSE'));
  assert.ok(codes(parseOfflineSnapshot(null)).includes('INPUT_TYPE'));
  assert.ok(codes(inspectOfflineSnapshot([])).includes('SNAPSHOT_SHAPE'));
  assert.ok(codes(inspectOfflineSnapshot({})).includes('RECORDS_REQUIRED'));
});

test('round trips valid JSON without network and no claim promotion', () => {
  const result = parseOfflineSnapshot(JSON.stringify({ records: [good()] }),
    { today: '2026-11-19' });
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].claims.stepFreeEntrance, 'unknown');
});

test('guards maximum record count before iteration', () => {
  const result = inspectOfflineSnapshot({ records: Array(offlineRecordPolicy.maxRecords + 1) });
  assert.ok(codes(result).includes('RECORD_LIMIT'));
});

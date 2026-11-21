import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATES, EVIDENCE_KEYS, SOURCE_KEYS, LICENCE_KEYS, DATE_KEYS,
  firstKey, metadata, metadataIssues, isEvidenceValue, explicitState,
  recordFields, inspectRecord, locationRecords, inspectReleasedRecords,
  inspectEvidenceLists, sourceSummary,
} from './evidence-audit.mjs';

const provenance = { source: 'Synthetic example',
  licence: 'CC0-1.0', observedOn: '2026-11-15' };
const codes = (issues) => issues.map(({ code }) => code);
const item = (state = 'UNKNOWN', extra = {}) => ({
  id: 'sample', ...provenance,
  fields: { stepFreeEntrance: { state, ...provenance } }, ...extra,
});

test('state enumeration keeps UNKNOWN distinct from YES and NO', () => {
  assert.deepEqual([...STATES], ['YES', 'NO', 'UNKNOWN']);
});

test('known accessibility field enumeration is nonempty', () => {
  assert.ok(EVIDENCE_KEYS.has('stepFreeEntrance'));
  assert.ok(EVIDENCE_KEYS.has('accessibleWashroom'));
  assert.ok(EVIDENCE_KEYS.has('turningSpace'));
});

test('metadata key aliases are explicitly enumerated', () => {
  assert.ok(SOURCE_KEYS.includes('sourceUrl'));
  assert.ok(LICENCE_KEYS.includes('license'));
  assert.ok(DATE_KEYS.includes('observed_on'));
});

test('firstKey returns the first available alias', () => {
  assert.equal(firstKey({ source: 'A', sourceUrl: 'B' }, SOURCE_KEYS), 'source');
});

test('firstKey returns undefined if no alias exists', () => {
  assert.equal(firstKey({ elsewhere: 'A' }, SOURCE_KEYS), undefined);
});

test('metadata understands original field names', () => {
  assert.deepEqual(metadata(provenance), {
    source: 'Synthetic example', licence: 'CC0-1.0', date: '2026-11-15',
  });
});

test('metadata understands alternative source naming', () => {
  assert.deepEqual(metadata({ sourceUrl: 'local/source',
    license: 'CC-BY-4.0', updated_at: '2026-11-14' }), {
    source: 'local/source', licence: 'CC-BY-4.0', date: '2026-11-14',
  });
});

test('metadata for null does not fabricate provenance', () => {
  assert.deepEqual(metadata(null), { source: null, licence: null, date: null });
});

test('complete metadata passes', () => {
  assert.deepEqual(metadataIssues(provenance, 'places.json', '/0'), []);
});

test('missing source fails', () => {
  assert.ok(codes(metadataIssues({ ...provenance, source: '' }, 'places.json', '/0'))
    .includes('EVIDENCE_SOURCE'));
});

test('proprietary licence fails', () => {
  assert.ok(codes(metadataIssues({ ...provenance, licence: 'Proprietary' },
    'places.json', '/0')).includes('EVIDENCE_LICENCE'));
});

test('invalid calendar date fails', () => {
  assert.ok(codes(metadataIssues({ ...provenance, observedOn: '2026-02-30' },
    'places.json', '/0')).includes('EVIDENCE_DATE'));
});

test('primitive explicit states are recognised', () => {
  assert.equal(isEvidenceValue('YES'), true);
  assert.equal(isEvidenceValue('NO'), true);
  assert.equal(isEvidenceValue('UNKNOWN'), true);
});

test('numeric widths are not accessibility states', () => {
  assert.equal(isEvidenceValue(900), false);
  assert.equal(isEvidenceValue('900'), false);
});

test('object state is recognised', () => {
  assert.equal(isEvidenceValue({ state: 'YES' }), true);
});

test('explicit state extracts object value', () => {
  assert.equal(explicitState({ state: 'UNKNOWN' }), 'UNKNOWN');
  assert.equal(explicitState({ value: 'NO' }), 'NO');
});

test('null evidence returns a null explicit state', () => {
  assert.equal(explicitState(null), null);
});

test('recordFields finds direct and nested fields', () => {
  const fields = recordFields({
    stepFreeEntrance: 'YES',
    accessibility: { accessibleParking: 'UNKNOWN' },
    fields: { accessibleWashroom: { state: 'NO' } },
  });
  assert.deepEqual(fields.map(({ name }) => name), [
    'stepFreeEntrance', 'fields/accessibleWashroom',
    'accessibility/accessibleParking',
  ]);
});

test('recordFields ignores unrelated business information', () => {
  assert.deepEqual(recordFields({ name: 'Test', doorWidth: 900,
    openingHours: 'YES' }), []);
});

test('UNKNOWN does not require speculative provenance', () => {
  assert.deepEqual(inspectRecord({ fields: { stepFreeEntrance: 'UNKNOWN' } },
    'places.json'), []);
});

test('a sourced YES passes', () => {
  assert.deepEqual(inspectRecord(item('YES'), 'places.json'), []);
});

test('a sourced NO passes', () => {
  assert.deepEqual(inspectRecord(item('NO'), 'places.json'), []);
});

test('primitive YES may use its owning record provenance', () => {
  assert.deepEqual(inspectRecord({ ...provenance, accessibleParking: 'YES' },
    'places.json'), []);
});

test('positive state without provenance fails', () => {
  const issues = inspectRecord({ stepFreeEntrance: 'YES' }, 'places.json');
  assert.ok(codes(issues).includes('EVIDENCE_SOURCE'));
  assert.ok(codes(issues).includes('EVIDENCE_LICENCE'));
  assert.ok(codes(issues).includes('EVIDENCE_DATE'));
});

test('negative state without provenance also fails', () => {
  assert.ok(codes(inspectRecord({ accessibleWashroom: 'NO' },
    'places.json')).includes('EVIDENCE_SOURCE'));
});

test('record date does not compensate for an unsupported licence', () => {
  assert.ok(codes(inspectRecord({ ...provenance, licence: 'Restricted',
    accessibleParking: 'YES' }, 'places.json')).includes('EVIDENCE_LICENCE'));
});

test('an evidence object with its own provenance passes', () => {
  assert.deepEqual(inspectRecord({ stepFreeEntrance: {
    state: 'YES', ...provenance,
  } }, 'places.json'), []);
});

test('invalid state objects fail', () => {
  assert.ok(codes(inspectRecord({ fields: { stepFreeEntrance: {
    state: 'probably', ...provenance,
  } } }, 'places.json')).includes('EVIDENCE_STATE'));
});

test('null evidence fields do not imply NO', () => {
  assert.deepEqual(inspectRecord({ accessibleParking: null }, 'places.json'), []);
});

test('locationRecords accepts a direct array', () => {
  assert.equal(locationRecords([{}, {}]).length, 2);
});

test('locationRecords accepts place collection', () => {
  assert.equal(locationRecords({ places: [{ id: 'x' }] }).length, 1);
});

test('locationRecords accepts a GeoJSON FeatureCollection', () => {
  assert.equal(locationRecords({ type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {} }] }).length, 1);
});

test('locationRecords rejects a non-collection', () => {
  assert.deepEqual(locationRecords({ name: 'Single record' }), []);
});

test('released place collection enforces licence', () => {
  const issues = inspectReleasedRecords({ places: [
    { accessibleEntrance: 'YES', source: 'A', observedOn: '2026-11-15' },
  ] }, 'places.json');
  assert.ok(codes(issues).includes('EVIDENCE_LICENCE'));
});

test('released collection accepts fully sourced evidence', () => {
  assert.deepEqual(inspectReleasedRecords({ places: [item('YES')] },
    'places.json'), []);
});

test('released GeoJSON permits provenance on Feature', () => {
  const features = [{ type: 'Feature', ...provenance,
    properties: { stepFreeEntrance: 'NO' }, geometry: null }];
  assert.deepEqual(inspectReleasedRecords({ type: 'FeatureCollection', features },
    'places.json'), []);
});

test('released GeoJSON rejects absent Feature metadata', () => {
  const features = [{ type: 'Feature',
    properties: { stepFreeEntrance: 'YES' }, geometry: null }];
  assert.ok(codes(inspectReleasedRecords({ type: 'FeatureCollection', features },
    'places.json')).includes('EVIDENCE_SOURCE'));
});

test('evidence list requires source metadata', () => {
  assert.ok(codes(inspectEvidenceLists({ evidence: [{}] },
    'places.json')).includes('EVIDENCE_SOURCE'));
});

test('source list rejects non-object entries', () => {
  assert.ok(codes(inspectEvidenceLists({ sources: [null] },
    'places.json')).includes('SOURCE_ENTRY'));
});

test('source list accepts open licensed records', () => {
  assert.deepEqual(inspectEvidenceLists({ sources: [provenance] },
    'places.json'), []);
});

test('sourceSummary counts unknown separately from negative', () => {
  assert.deepEqual(sourceSummary({ records: [
    { fields: { stepFreeEntrance: 'YES', accessibleParking: 'UNKNOWN' } },
    { fields: { accessibleWashroom: 'NO' } },
  ] }), { records: 2, yes: 1, no: 1, unknown: 1 });
});

test('sourceSummary does not extrapolate from numeric measurements', () => {
  assert.deepEqual(sourceSummary({ records: [{ doorWidth: 900 }] }),
    { records: 1, yes: 0, no: 0, unknown: 0 });
});

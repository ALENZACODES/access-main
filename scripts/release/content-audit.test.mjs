import test from 'node:test';
import assert from 'node:assert/strict';
import {
  walkJson, evidenceState, isPlaceLike, placeIdentity, claimedFields,
  inspectPlaceIntegrity, inspectUniquePlaces, inspectCredits,
  inspectUnknownIntegrity, inspectContentJson,
} from './content-audit.mjs';

const SOURCE = { source: 'Fixture', licence: 'CC0-1.0', observedOn: '2026-11-15' };
const place = (overrides = {}) => ({
  id: 'example-1', name: 'Example', ...SOURCE,
  fields: { stepFreeEntrance: 'UNKNOWN' }, ...overrides,
});
const codes = (issues) => issues.map((issue) => issue.code);

test('walker traverses nested objects using JSON pointers', () => {
  const pointers = [];
  walkJson({ items: [{ id: 'one' }] }, (_node, pointer) => pointers.push(pointer));
  assert.deepEqual(pointers, ['', '/items', '/items/0']);
});

test('walker escapes JSON pointer slashes', () => {
  const pointers = [];
  walkJson({ 'a/b': {} }, (_node, pointer) => pointers.push(pointer));
  assert.deepEqual(pointers, ['', '/a~1b']);
});

test('walker escapes JSON pointer tildes', () => {
  const pointers = [];
  walkJson({ 'a~b': {} }, (_node, pointer) => pointers.push(pointer));
  assert.deepEqual(pointers, ['', '/a~0b']);
});

test('walker handles a cyclic input without looping', () => {
  const item = {};
  item.self = item;
  const pointers = [];
  walkJson(item, (_node, pointer) => pointers.push(pointer));
  assert.deepEqual(pointers, ['']);
});

test('walker ignores primitive input', () => {
  let visits = 0;
  walkJson('text', () => { visits += 1; });
  assert.equal(visits, 0);
});

test('walker visits arrays', () => {
  const pointers = [];
  walkJson([{}], (_node, pointer) => pointers.push(pointer));
  assert.deepEqual(pointers, ['', '/0']);
});

test('state reader preserves UNKNOWN', () => {
  assert.equal(evidenceState('UNKNOWN'), 'UNKNOWN');
});

test('state reader preserves explicit YES', () => {
  assert.equal(evidenceState('YES'), 'YES');
});

test('state reader preserves explicit NO', () => {
  assert.equal(evidenceState({ state: 'NO' }), 'NO');
});

test('state reader refuses booleans', () => {
  assert.equal(evidenceState(true), null);
  assert.equal(evidenceState(false), null);
});

test('state reader refuses arbitrary text', () => {
  assert.equal(evidenceState('probably'), null);
});

test('state reader sees an invalid explicit object state', () => {
  assert.equal(evidenceState({ state: 'MAYBE' }), 'MAYBE');
});

test('state reader refuses null', () => {
  assert.equal(evidenceState(null), null);
});

test('place detection requires an identifier', () => {
  assert.equal(isPlaceLike({ name: 'Place', fields: {} }), false);
});

test('place detection requires a name', () => {
  assert.equal(isPlaceLike({ id: 'id', fields: {} }), false);
});

test('place detection requires an accessibility container', () => {
  assert.equal(isPlaceLike({ id: 'id', name: 'Place' }), false);
});

test('place detection recognises a place with named fields', () => {
  assert.equal(isPlaceLike(place()), true);
});

test('place detection recognises alternate ID and name fields', () => {
  assert.equal(isPlaceLike({ placeId: 'p', title: 'Title', features: {} }), true);
});

test('place identity returns the primary ID', () => {
  assert.equal(placeIdentity(place()), 'example-1');
});

test('place identity can use locationId', () => {
  assert.equal(placeIdentity({ locationId: 'location-1' }), 'location-1');
});

test('place identity rejects whitespace-only ID', () => {
  assert.equal(placeIdentity({ id: ' ' }), null);
});

test('claim reader finds recognised fields', () => {
  assert.deepEqual(claimedFields(place()).map((item) => item.key),
    ['stepFreeEntrance']);
});

test('claim reader ignores unrelated metadata', () => {
  assert.deepEqual(claimedFields(place({ fields: { elevation: 120 } })), []);
});

test('claim reader examines features', () => {
  assert.deepEqual(claimedFields(place({ fields: {}, features: {
    accessibleParking: 'UNKNOWN',
  } })).map((item) => item.key), ['accessibleParking']);
});

test('claim reader examines accessibility property', () => {
  assert.deepEqual(claimedFields(place({ fields: {}, accessibility: {
    elevator: 'NO',
  } })).map((item) => item.key), ['elevator']);
});

test('integrity permits unknown field without source on its own', () => {
  assert.deepEqual(inspectPlaceIntegrity(place({
    source: '', fields: { ramp: 'UNKNOWN' },
  }), 'data.json', '/0'), []);
});

test('integrity permits YES with source on parent', () => {
  assert.deepEqual(inspectPlaceIntegrity(place({
    fields: { ramp: 'YES' },
  }), 'data.json', '/0'), []);
});

test('integrity permits NO with source on claim', () => {
  assert.deepEqual(inspectPlaceIntegrity(place({
    source: '', fields: { ramp: { state: 'NO', ...SOURCE } },
  }), 'data.json', '/0'), []);
});

test('integrity rejects YES without source', () => {
  assert.ok(codes(inspectPlaceIntegrity(place({
    source: '', fields: { ramp: 'YES' },
  }), 'data.json', '/0')).includes('CONTENT_ACCESS_SOURCE'));
});

test('integrity rejects NO without open licence', () => {
  assert.ok(codes(inspectPlaceIntegrity(place({
    licence: 'closed', fields: { ramp: 'NO' },
  }), 'data.json', '/0')).includes('CONTENT_ACCESS_SOURCE'));
});

test('integrity rejects invalid calendar date', () => {
  assert.ok(codes(inspectPlaceIntegrity(place({
    observedOn: '2026-02-30', fields: { ramp: 'NO' },
  }), 'data.json', '/0')).includes('CONTENT_ACCESS_SOURCE'));
});

test('integrity rejects boolean accessibility field', () => {
  assert.ok(codes(inspectPlaceIntegrity(place({
    fields: { stepFreeEntrance: true },
  }), 'data.json', '/0')).includes('CONTENT_ACCESS_STATE'));
});

test('integrity rejects null accessibility field', () => {
  assert.ok(codes(inspectPlaceIntegrity(place({
    fields: { accessibleParking: null },
  }), 'data.json', '/0')).includes('CONTENT_ACCESS_STATE'));
});

test('integrity rejects ambiguous accessibility text', () => {
  assert.ok(codes(inspectPlaceIntegrity(place({
    fields: { accessibleWashroom: 'likely' },
  }), 'data.json', '/0')).includes('CONTENT_ACCESS_STATE'));
});

test('integrity rejects invented object state', () => {
  assert.ok(codes(inspectPlaceIntegrity(place({
    fields: { stepFreeEntrance: { state: 'MAYBE' } },
  }), 'data.json', '/0')).includes('CONTENT_ACCESS_STATE'));
});

test('integrity does not coerce numeric measurements', () => {
  assert.deepEqual(inspectPlaceIntegrity(place({
    fields: { doorWidth: 90 },
  }), 'data.json', '/0'), []);
});

test('duplicate place detection accepts separate identifiers', () => {
  assert.deepEqual(inspectUniquePlaces([
    place({ id: 'one' }), place({ id: 'two' }),
  ], 'places.json'), []);
});

test('duplicate place detection rejects same identifier', () => {
  assert.ok(codes(inspectUniquePlaces([
    place({ id: 'one' }), place({ id: 'one' }),
  ], 'places.json')).includes('CONTENT_DUPLICATE_PLACE'));
});

test('duplicate place detection works through nested collections', () => {
  assert.ok(codes(inspectUniquePlaces({
    places: [place(), place()],
  }, 'places.json')).includes('CONTENT_DUPLICATE_PLACE'));
});

test('duplicate place detection ignores unrelated records', () => {
  assert.deepEqual(inspectUniquePlaces([
    { id: 'one', name: 'Caption' }, { id: 'one', name: 'Caption' },
  ], 'places.json'), []);
});

test('attribution checker accepts open credit', () => {
  assert.deepEqual(inspectCredits({ attribution: 'Example source',
    licence: 'CC0-1.0', observedOn: '2026-11-15' }, 'credits.json'), []);
});

test('attribution checker rejects missing text', () => {
  assert.ok(codes(inspectCredits({ attribution: '  ',
    licence: 'CC0-1.0' }, 'credits.json')).includes('CONTENT_ATTRIBUTION'));
});

test('attribution checker rejects unsupported licence', () => {
  assert.ok(codes(inspectCredits({ attribution: 'Source',
    licence: 'Private' }, 'credits.json')).includes('CONTENT_LICENCE'));
});

test('attribution checker rejects malformed recorded date', () => {
  assert.ok(codes(inspectCredits({ attribution: 'Source',
    licence: 'CC0-1.0', observedOn: 'yesterday' }, 'credits.json'))
    .includes('CONTENT_DATE'));
});

test('attribution checker ignores unrelated licence descriptors', () => {
  assert.deepEqual(inspectCredits({ licence: 'Internal' }, 'metadata.json'), []);
});

test('unknown state without extra claims remains unknown', () => {
  assert.deepEqual(inspectUnknownIntegrity({ state: 'UNKNOWN' }, 'places.json'), []);
});

test('unknown state cannot imply boolean accessible true', () => {
  assert.ok(codes(inspectUnknownIntegrity({
    state: 'UNKNOWN', accessible: true,
  }, 'places.json')).includes('CONTENT_UNKNOWN_CONFLICT'));
});

test('unknown state cannot imply boolean accessible false', () => {
  assert.ok(codes(inspectUnknownIntegrity({
    state: 'UNKNOWN', accessible: false,
  }, 'places.json')).includes('CONTENT_UNKNOWN_CONFLICT'));
});

test('unknown state cannot be automatically filled', () => {
  assert.ok(codes(inspectUnknownIntegrity({
    state: 'UNKNOWN', autoFilled: true,
  }, 'places.json')).includes('CONTENT_UNKNOWN_INFERENCE'));
});

test('unknown state cannot be labelled assumed', () => {
  assert.ok(codes(inspectUnknownIntegrity({
    state: 'UNKNOWN', assumed: true,
  }, 'places.json')).includes('CONTENT_UNKNOWN_INFERENCE'));
});

test('unknown state can include neutral notes', () => {
  assert.deepEqual(inspectUnknownIntegrity({
    state: 'UNKNOWN', notes: 'Not assessed',
  }, 'places.json'), []);
});

test('combined JSON checker reports missing source and conflicts', () => {
  const result = inspectContentJson({ places: [place({
    source: '', fields: { stepFreeEntrance: 'YES',
      accessibleParking: { state: 'UNKNOWN', accessible: true } },
  })] }, 'places.json');
  assert.ok(codes(result).includes('CONTENT_ACCESS_SOURCE'));
  assert.ok(codes(result).includes('CONTENT_UNKNOWN_CONFLICT'));
});

test('combined JSON checker leaves an unknown record intact', () => {
  const value = { places: [place()] };
  const before = JSON.stringify(value);
  assert.deepEqual(inspectContentJson(value, 'places.json'), []);
  assert.equal(JSON.stringify(value), before);
});

test('combined JSON checker ignores primitive data', () => {
  assert.deepEqual(inspectContentJson('text', 'text.json'), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, UNKNOWN, KINDS, RESULTS, LANGUAGES, TIERS, LIMITS, plain, day, text, id, routePath, problem, unexpected, checkObservation, checkRoute, validate, parse, example } from './interaction-evidence-contract.mjs';
import { check, route, snapshot, paired, measured, DATE } from './interaction-evidence-fixtures.mjs';
const errors = result => result.issues.map(x => x.code);
const fail = (data, code) => assert.ok(errors(validate(data)).includes(code), `${code}: ${JSON.stringify(validate(data).issues)}`);
const good = data => assert.equal(validate(data).ok, true, JSON.stringify(validate(data).issues));
const modify = (field, value) => snapshot(route({ checks: [check({ [field]: value })] }));

test('schema version is explicit and not inferred', () => {
  assert.equal(VERSION, 1);
  assert.equal(example().schemaVersion, VERSION);
  assert.equal(validate({ ...example(), schemaVersion: 2 }).ok, false);
});
test('unknown token is always uppercase', () => {
  assert.equal(UNKNOWN, 'UNKNOWN');
  assert.ok(RESULTS.includes(UNKNOWN));
  assert.ok(TIERS.includes(UNKNOWN));
});
test('all six interaction kinds are present', () => {
  assert.deepEqual(KINDS, ['touch-target', 'focus', 'accessible-name', 'keyboard', 'screen-reader', 'status-message']);
  assert.equal(new Set(KINDS).size, 6);
});
test('English and French are the only interchange languages', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr']);
  fail(snapshot(route({ language: 'es' })), 'LANGUAGE');
});
test('limits are finite and positive', () => {
  for (const count of Object.values(LIMITS)) assert.ok(Number.isInteger(count) && count > 0);
  assert.ok(LIMITS.bytes < 50_000_000);
});
test('example is explicitly fictional and makes no accessibility claim', () => {
  const data = example();
  good(data);
  assert.equal(data.routes[0].checks[0].result, UNKNOWN);
  assert.match(data.routes[0].checks[0].source, /fixture|Illustrative/i);
});
test('empty inventory is valid and includes an explicit date', () => {
  good({ schemaVersion: 1, capturedOn: DATE, routes: [] });
  assert.deepEqual(parse(JSON.stringify({ schemaVersion: 1, capturedOn: DATE, routes: [] })).value.routes, []);
});
test('paired route snapshot remains valid', () => good(paired()));
test('parse round-trip retains raw UNKNOWN instead of guessing', () => {
  const data = parse(JSON.stringify(snapshot()));
  assert.equal(data.ok, true);
  assert.equal(data.value.routes[0].checks[0].result, UNKNOWN);
});
test('plain objects reject arrays, dates and functions', () => {
  for (const value of [null, [], new Date(), () => 1, 3, 'text']) assert.equal(plain(value), false);
  assert.equal(plain({}), true);
  assert.equal(plain(Object.create(null)), true);
});
test('empty and malformed source text is rejected', () => {
  for (const value of ['', ' ', ' a', 'a ', '\t', '\n', 42, null, undefined]) assert.equal(text(value), false);
  assert.equal(text('A documented example'), true);
});
test('control characters cannot cross the interchange boundary', () => {
  for (const char of ['\0', '\u0001', '\u0008', '\u000b', '\u001f', '\u007f', '\ufffd']) assert.equal(text(`a${char}b`), false);
  assert.equal(text('Deuxième point'), true);
});
test('long text is bounded by the caller supplied length', () => {
  assert.equal(text('A'.repeat(40), 40), true);
  assert.equal(text('A'.repeat(41), 40), false);
});
test('known leap days validate exactly', () => {
  for (const value of ['2024-02-29', '2000-02-29', '2026-11-21']) assert.equal(day(value), true);
});
test('invalid Gregorian dates fail without coercion', () => {
  for (const value of ['2026-02-29', '1900-02-29', '2026-11-31', '2026-13-01', '0000-01-01', '2026-00-12', '2026-01-00', '2026-1-1', null]) assert.equal(day(value), false, String(value));
});
test('identifiers reject path traversal and prototype keys', () => {
  for (const value of ['../foo', '/foo', '__proto__', 'constructor', 'prototype', 'space here', '', null, 'x'.repeat(97)]) assert.equal(id(value), false, String(value));
  for (const value of ['fictional', 'a-1', 'A.B:4']) assert.equal(id(value), true, value);
});
test('route paths require safe absolute routes', () => {
  for (const value of ['a', '//double', '/a//b', '/a/../b', '/a/./b', '/a?secret', '/a#frag', '/a%20b', '/a\\b', '']) assert.equal(routePath(value), false, value);
  assert.equal(routePath('/'), true);
  assert.equal(routePath('/fictional/example'), true);
});
test('issue messages contain only code and bounded path', () => {
  assert.deepEqual(problem('FAIL', 'routes[0]'), { code: 'FAIL', path: 'routes[0]' });
});
test('unexpected fields are reported deterministically', () => {
  assert.deepEqual(unexpected({ x: 1, y: 2 }, ['x'], 'root'), [problem('UNRECOGNISED_FIELD', 'root.y')]);
});
test('invalid today fails before attempting to inspect input', () => {
  assert.deepEqual(errors(validate(null, { today: 'tomorrow' })), ['INVALID_TODAY']);
});
test('future captured dates are rejected', () => fail({ ...snapshot(), capturedOn: '2026-11-22' }, 'CAPTURED_ON'));
test('future source retrieval dates are rejected', () => fail(modify('retrievedOn', '2026-11-22'), 'RETRIEVED_ON'));
test('route id collisions are rejected', () => fail(snapshot(route(), route({ language: 'fr' })), 'DUPLICATE_ROUTE'));
test('route path plus language collisions are rejected', () => fail(snapshot(route(), route({ id: 'second' })), 'DUPLICATE_PATH_LANGUAGE'));
test('identical check IDs within one route are rejected', () => fail(snapshot(route({ checks: [check(), check()] })), 'DUPLICATE_CHECK'));
test('same check ID in different languages is permitted', () => good(paired()));
test('unknown document fields are rejected', () => fail({ ...snapshot(), hidden: 'private' }, 'UNRECOGNISED_FIELD'));
test('unknown route fields are rejected', () => fail(snapshot(route({ private: 'x' })), 'UNRECOGNISED_FIELD'));
test('unknown observation fields are rejected', () => fail(modify('privateValue', 'x'), 'UNRECOGNISED_FIELD'));
test('null root is rejected', () => assert.deepEqual(errors(validate(null)), ['ROOT_OBJECT']));
test('array root is rejected', () => assert.deepEqual(errors(validate([])), ['ROOT_OBJECT']));
test('wrong schema versions are rejected', () => {
  for (const version of [null, 0, 2, '1', undefined]) fail({ ...snapshot(), schemaVersion: version }, 'VERSION');
});
test('route list must be an array', () => {
  for (const value of [null, {}, 'list', 3]) fail({ ...snapshot(), routes: value }, 'ROUTE_LIST');
});
test('route list limit is enforced', () => {
  fail({ ...snapshot(), routes: Array.from({ length: LIMITS.routes + 1 }, () => route()) }, 'ROUTE_LIST');
});
test('check list must be an array', () => {
  for (const value of [null, {}, 'list', 3]) fail(snapshot(route({ checks: value })), 'CHECK_LIST');
});
test('check list limit is enforced', () => {
  fail(snapshot(route({ checks: Array.from({ length: LIMITS.checks + 1 }, () => check()) })), 'CHECK_LIST');
});
test('malformed routes report their position', () => {
  const result = checkRoute(null, 2, DATE);
  assert.deepEqual(result.issues, [problem('ROUTE_OBJECT', 'routes[2]')]);
});
test('malformed checks report their position', () => {
  const result = checkObservation(null, 'routes[0].checks[7]', DATE);
  assert.deepEqual(result.issues, [problem('CHECK_OBJECT', 'routes[0].checks[7]')]);
});
test('observation id must match safe identifier grammar', () => fail(modify('id', '../invalid'), 'CHECK_ID'));
test('route id must match safe identifier grammar', () => fail(snapshot(route({ id: 'bad id' })), 'ROUTE_ID'));
test('route language must be an explicit supported value', () => fail(snapshot(route({ language: UNKNOWN })), 'LANGUAGE'));
test('observation kind must be explicitly supported', () => fail(modify('kind', 'guaranteed-accessible'), 'CHECK_KIND'));
test('observation result cannot be a generic accessibility assertion', () => fail(modify('result', 'ACCESSIBLE'), 'CHECK_RESULT'));
test('source is mandatory on every record', () => fail(modify('source', ''), 'SOURCE_REQUIRED'));
test('licence is mandatory on every record', () => fail(modify('licence', ''), 'LICENCE_REQUIRED'));
test('verification tier must use a defined token', () => fail(modify('verificationTier', 'certified'), 'VERIFICATION_TIER'));
test('notes cannot be empty or whitespace when supplied', () => fail(modify('note', ''), 'NOTE'));
test('notes can be omitted entirely', () => good(snapshot()));
test('digest accepts lowercase SHA-256 hex only', () => {
  good(modify('digest', 'a'.repeat(64)));
  fail(modify('digest', 'A'.repeat(64)), 'DIGEST');
  fail(modify('digest', 'abc'), 'DIGEST');
});
test('touch observation is UNKNOWN without a measurement', () => good(snapshot()));
test('PASS target requires two dimensions', () => fail(modify('result', 'PASS'), 'UNSUPPORTED_PASS'));
test('FAIL target requires two dimensions', () => fail(modify('result', 'FAIL'), 'UNSUPPORTED_FAIL'));
test('target must include either both dimensions or neither', () => fail(modify('width', 44), 'MEASUREMENT_PAIR'));
test('target cannot have negative dimensions', () => fail(modify('width', -1), 'MEASUREMENT_SIZE'));
test('target cannot have infinite dimensions', () => fail(modify('height', Infinity), 'MEASUREMENT_SIZE'));
test('target width cannot be a string', () => fail(modify('width', '44'), 'MEASUREMENT_SIZE'));
test('target height cannot be a string', () => fail(modify('height', '44'), 'MEASUREMENT_SIZE'));
test('target cannot exceed bounded measure range', () => fail(modify('width', 5001), 'MEASUREMENT_SIZE'));
test('target at exact 44 by 44 is a supported PASS', () => good(snapshot(route({ checks: [measured()] }))));
test('target at 43 by 44 cannot claim PASS', () => fail(snapshot(route({ checks: [check({ result: 'PASS', width: 43, height: 44 })] })), 'UNSUPPORTED_PASS'));
test('target at 44 by 43 cannot claim PASS', () => fail(snapshot(route({ checks: [check({ result: 'PASS', width: 44, height: 43 })] })), 'UNSUPPORTED_PASS'));
test('target at 44 by 44 cannot claim FAIL for size', () => fail(snapshot(route({ checks: [check({ result: 'FAIL', width: 44, height: 44 })] })), 'UNSUPPORTED_FAIL'));
test('target at 43 by 44 can record FAIL', () => good(snapshot(route({ checks: [measured('touch-target', 'FAIL')] }))));
test('focus visible true is consistent with PASS', () => good(snapshot(route({ checks: [measured('focus')] }))));
test('focus visible false is consistent with FAIL', () => good(snapshot(route({ checks: [measured('focus', 'FAIL')] }))));
test('focus visible false cannot support PASS', () => fail(snapshot(route({ checks: [check({ kind: 'focus', result: 'PASS', focusVisible: false })] })), 'UNSUPPORTED_PASS'));
test('focus visible true cannot support FAIL', () => fail(snapshot(route({ checks: [check({ kind: 'focus', result: 'FAIL', focusVisible: true })] })), 'UNSUPPORTED_FAIL'));
test('focus true must not accept string booleans', () => fail(snapshot(route({ checks: [check({ kind: 'focus', focusVisible: 'true' })] })), 'MEASUREMENT_BOOLEAN'));
test('keyboard true supports a recorded PASS', () => good(snapshot(route({ checks: [measured('keyboard')] }))));
test('keyboard false supports a recorded FAIL', () => good(snapshot(route({ checks: [measured('keyboard', 'FAIL')] }))));
test('keyboard missing cannot support PASS', () => fail(snapshot(route({ checks: [check({ kind: 'keyboard', result: 'PASS' })] })), 'UNSUPPORTED_PASS'));
test('screen reader announced true supports PASS', () => good(snapshot(route({ checks: [measured('screen-reader')] }))));
test('screen reader announced false supports FAIL', () => good(snapshot(route({ checks: [measured('screen-reader', 'FAIL')] }))));
test('status announcement true supports PASS', () => good(snapshot(route({ checks: [measured('status-message')] }))));
test('status announcement false supports FAIL', () => good(snapshot(route({ checks: [measured('status-message', 'FAIL')] }))));
test('explicit accessible name supports a recorded PASS', () => good(snapshot(route({ checks: [measured('accessible-name')] }))));
test('missing accessible name cannot support PASS', () => fail(snapshot(route({ checks: [check({ kind: 'accessible-name', result: 'PASS' })] })), 'UNSUPPORTED_PASS'));
test('measurements from another kind fail closed', () => fail(snapshot(route({ checks: [check({ focusVisible: true })] })), 'MEASUREMENT_KIND'));
test('named controls cannot use blank accessible name', () => fail(snapshot(route({ checks: [check({ kind: 'accessible-name', accessibleName: '' })] })), 'MEASUREMENT_NAME'));
test('screen reader announced value must be boolean', () => fail(snapshot(route({ checks: [check({ kind: 'screen-reader', announced: 1 })] })), 'MEASUREMENT_BOOLEAN'));
test('unknown never becomes PASS because measured values are positive', () => {
  const data = snapshot(route({ checks: [check({ width: 60, height: 60 })] }));
  good(data);
  assert.equal(validate(data).value.routes[0].checks[0].result, UNKNOWN);
});
test('all kinds can be represented without invented measurements', () => {
  const rows = KINDS.map((kind, n) => check({ id: `kind-${n}`, kind }));
  good(snapshot(route({ checks: rows })));
});
test('parse refuses oversized inputs', () => assert.deepEqual(errors(parse('x'.repeat(LIMITS.bytes + 1))), ['INPUT_SIZE']));
test('parse refuses malformed JSON', () => assert.deepEqual(errors(parse('{not json')), ['INVALID_JSON']));
test('parse refuses non-text inputs', () => assert.deepEqual(errors(parse(null)), ['INPUT_SIZE']));
test('parse rejects malformed date', () => fail({ ...snapshot(), capturedOn: '2026-11-31' }, 'CAPTURED_ON'));
test('safe JSON parse never materializes unknown field values as supported data', () => {
  const value = parse(JSON.stringify(modify('extra', 'not allowed')));
  assert.equal(value.ok, false);
  assert.ok(errors(value).includes('UNRECOGNISED_FIELD'));
});

test('explicitly measured empty name can record FAIL without inventing a label', () => {
  good(snapshot(route({ checks: [measured('accessible-name', 'FAIL')] })));
});
test('a failed name check with nonempty label is inconsistent', () => {
  fail(snapshot(route({ checks: [check({ kind: 'accessible-name', result: 'FAIL', accessibleName: 'Named control' })] })), 'UNSUPPORTED_FAIL');
});
test('an empty accessible name cannot be claimed as PASS', () => {
  fail(snapshot(route({ checks: [check({ kind: 'accessible-name', result: 'PASS', accessibleName: '' })] })), 'MEASUREMENT_NAME');
});

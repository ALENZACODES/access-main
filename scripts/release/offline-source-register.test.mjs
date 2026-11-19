import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REGISTER_VERSION, SOURCE_STATES, SOURCE_ACTIONS, SOURCE_TYPES,
  CLAIM_STATES, REGISTER_LIMITS, inspectSource, inspectReference,
  validateRegister, emptyRegister, addSource, addReference,
  transitionSource, sourceDependents, sourceHealth, canonicalRegister,
  registerFingerprint, serializeRegister, parseRegister, mergeRegisters,
} from './offline-source-register.mjs';

const TODAY = '2026-11-19';
const OPTIONS = { today: TODAY };
const source = (id = 'source-one', overrides = {}) => ({
  id, title: { en: 'Synthetic source', fr: 'Source fictive' },
  type: 'open-data', url: 'https://example.org/data',
  licence: 'CC0-1.0', retrievedOn: TODAY,
  tier: 0, state: 'listed', history: [], ...overrides,
});
const reference = (id = 'reference-one', overrides = {}) => ({
  id, sourceId: 'source-one', recordId: 'record-one', field: 'ramp',
  state: 'UNKNOWN', observedOn: '2026-11-18', ...overrides,
});
const register = (sources = [source()], references = [reference()]) => ({
  version: REGISTER_VERSION, sources, references,
});
const codes = (result) => result.problems.map((value) => value.code);
const has = (result, code) => assert.ok(codes(result).includes(code), `${code}: ${JSON.stringify(result.problems)}`);
const issues = (entry) => entry.map((value) => value.code);
const clone = (value) => JSON.parse(JSON.stringify(value));

// The register represents metadata, not a verification engine.
test('register vocabulary is explicit and bounded', () => {
  assert.equal(REGISTER_VERSION, 1);
  assert.deepEqual(CLAIM_STATES, ['YES', 'NO', 'UNKNOWN']);
  assert.equal(new Set(SOURCE_STATES).size, SOURCE_STATES.length);
  assert.equal(new Set(SOURCE_ACTIONS).size, SOURCE_ACTIONS.length);
  assert.equal(new Set(SOURCE_TYPES).size, SOURCE_TYPES.length);
  assert.ok(REGISTER_LIMITS.sources <= REGISTER_LIMITS.references);
  assert.ok(REGISTER_LIMITS.bytes < 50_000_000);
});

test('an empty register is valid without inventing records', () => {
  assert.deepEqual(emptyRegister(), register([], []));
  assert.deepEqual(validateRegister(emptyRegister(), OPTIONS), { ok: true, problems: [] });
});

test('a complete source and UNKNOWN reference validate', () => {
  assert.equal(validateRegister(register(), OPTIONS).ok, true);
  assert.equal(sourceHealth(register(), OPTIONS).summary.claims.UNKNOWN, 1);
});

test('known states remain exactly the states supplied by the caller', () => {
  for (const state of CLAIM_STATES) {
    const input = register([source()], [reference('reference-one', { state })]);
    assert.equal(validateRegister(input, OPTIONS).ok, true, state);
    assert.equal(sourceHealth(input, OPTIONS).summary.claims[state], 1);
  }
});

test('missing claim is invalid, not automatically UNKNOWN', () => {
  const input = register([source()], [reference('reference-one', { state: undefined })]);
  has(validateRegister(input, OPTIONS), 'CLAIM_STATE');
});

test('boolean truth flags are never accepted as claims', () => {
  for (const state of [true, false, 0, 1, null]) {
    has(validateRegister(register([source()], [reference('r', { state })]), OPTIONS), 'CLAIM_STATE');
  }
});

test('casings and user-facing paraphrases are not protocol states', () => {
  for (const state of ['yes', 'no', 'Unknown', 'unknown', 'available', 'inaccessible']) {
    has(validateRegister(register([source()], [reference('r', { state })]), OPTIONS), 'CLAIM_STATE');
  }
});

test('all four documented source types are recognized', () => {
  for (const type of SOURCE_TYPES) {
    assert.deepEqual(inspectSource(source('s', { type }), 0, OPTIONS), [], type);
  }
});

test('unsupported source type fails closed', () => {
  assert.ok(issues(inspectSource(source('s', { type: 'guessed-from-location' }))).includes('SOURCE_TYPE'));
});

test('source identifier is required and cannot be inferred from title', () => {
  for (const id of ['', 'bad id', '/path', 'constructor', '__proto__', null]) {
    assert.ok(issues(inspectSource(source(id))).includes('SOURCE_ID'), String(id));
  }
});

test('reference identifiers must be explicit', () => {
  for (const field of ['id', 'sourceId', 'recordId', 'field']) {
    const value = reference();
    delete value[field];
    assert.ok(issues(inspectReference(value, 0, new Set(['source-one']))).includes('REFERENCE_ID'), field);
  }
});

test('duplicate source IDs are rejected without coalescing', () => {
  has(validateRegister(register([source(), source()], []), OPTIONS), 'DUPLICATE_SOURCE');
});

test('duplicate reference IDs are rejected without overwriting', () => {
  has(validateRegister(register([source()], [reference(), reference()]), OPTIONS), 'DUPLICATE_REFERENCE');
});

test('a reference must point to an existing source', () => {
  has(validateRegister(register([source()], [reference('r', { sourceId: 'missing' })]), OPTIONS), 'SOURCE_NOT_FOUND');
});

test('source reference is not resolved from matching titles or URLs', () => {
  const one = source('one');
  const two = source('two');
  const input = register([one, two], [reference('r', { sourceId: 'three' })]);
  has(validateRegister(input, OPTIONS), 'SOURCE_NOT_FOUND');
});

test('unrecognized tiers are not given a default', () => {
  for (const tier of ['UNKNOWN', 'VERIFIED', 'UNVERIFIED', 5, null, '0']) {
    assert.ok(issues(inspectSource(source('s', { tier }))).includes('SOURCE_TIER'), String(tier));
  }
});

test('numeric tier identifiers and the document tier are accepted only as identifiers', () => {
  for (const tier of [0, 1, 2, 3, 4, 'E']) {
    assert.equal(inspectSource(source('s', { tier })).length, 0, String(tier));
  }
});

test('tier selection does not influence a claim state', () => {
  for (const tier of [0, 1, 2, 3, 4, 'E']) {
    const result = sourceHealth(register([source('source-one', { tier })]), OPTIONS);
    assert.equal(result.summary.claims.UNKNOWN, 1, String(tier));
    assert.equal(result.summary.claims.YES, 0);
  }
});

test('a made-up open licence does not count', () => {
  for (const licence of ['Open', 'Public domain', 'All rights reserved', '', null]) {
    assert.ok(issues(inspectSource(source('s', { licence }))).includes('SOURCE_LICENCE'));
  }
});

test('recognized open licence identifiers are accepted', () => {
  for (const licence of ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'ODbL-1.0',
    'OGL-Canada-2.0', 'OGL-Canada-3.0', 'OGL-Ontario-1.0']) {
    assert.deepEqual(inspectSource(source('s', { licence })), [], licence);
  }
});

test('source links must be HTTPS with no embedded credentials', () => {
  for (const url of ['http://example.org', 'file:///tmp/a', 'javascript:alert(1)',
    'https://user:pw@example.org', 'https://localhost/secret', 'https://127.0.0.1/a',
    'https://[::1]/', 'https://example.org/\n', '', null]) {
    assert.ok(issues(inspectSource(source('s', { url }))).includes('SOURCE_URL'), String(url));
  }
});

test('valid HTTP URLs do not become acceptable by carrying an open licence', () => {
  const result = inspectSource(source('s', { url: 'http://example.org', licence: 'CC0-1.0' }));
  assert.ok(issues(result).includes('SOURCE_URL'));
});

test('retrieval dates are real calendar days', () => {
  for (const retrievedOn of ['2026-02-30', '2025-02-29', '2026-13-01',
    '2026-00-01', '2026-1-3', 'yesterday', '', null]) {
    assert.ok(issues(inspectSource(source('s', { retrievedOn }))).includes('SOURCE_DATE'), String(retrievedOn));
  }
});

test('valid leap dates remain accepted', () => {
  assert.equal(inspectSource(source('s', { retrievedOn: '2024-02-29' })).length, 0);
});

test('source date cannot follow retrieval', () => {
  const result = inspectSource(source('s', { sourceDate: '2026-11-20' }), 0, OPTIONS);
  assert.ok(issues(result).includes('SOURCE_AFTER_RETRIEVAL'));
});

test('source date is optional but must be valid if supplied', () => {
  assert.equal(inspectSource(source('s', { sourceDate: '2026-11-18' })).length, 0);
  assert.ok(issues(inspectSource(source('s', { sourceDate: '2026-02-30' }))).includes('OBSERVATION_DATE'));
});

test('explicit today bound rejects future retrieval without a clock', () => {
  assert.ok(issues(inspectSource(source('s', { retrievedOn: '2026-11-20' }), 0, OPTIONS)).includes('FUTURE_RETRIEVAL'));
  assert.equal(inspectSource(source('s', { retrievedOn: '2026-11-20' }), 0).length, 0);
});

test('references cannot claim an observation after source retrieval', () => {
  has(validateRegister(register([source()], [reference('r', { observedOn: '2026-11-20' })]), OPTIONS), 'REFERENCE_AFTER_RETRIEVAL');
});

test('reference date must be valid in its own right', () => {
  has(validateRegister(register([source()], [reference('r', { observedOn: '2026-02-30' })]), OPTIONS), 'REFERENCE_DATE');
});

test('future reference is rejected relative to supplied date', () => {
  has(validateRegister(register([source('source-one', { retrievedOn: '2026-11-21' })],
    [reference('r', { observedOn: '2026-11-20' })]), OPTIONS), 'FUTURE_REFERENCE');
});

test('missing source metadata is reported on every record', () => {
  for (const field of ['url', 'licence', 'retrievedOn', 'tier']) {
    const entry = source();
    delete entry[field];
    assert.ok(inspectSource(entry).length > 0, field);
  }
});

test('bilingual source titles require both languages', () => {
  for (const title of [{ en: 'Only English' }, { fr: 'Français' },
    { en: '', fr: 'Source' }, { en: 'Source', fr: '' }, null, []]) {
    assert.ok(issues(inspectSource(source('s', { title }))).includes('SOURCE_TITLE'));
  }
});

test('descriptions may be omitted but cannot be unilingual', () => {
  assert.equal(inspectSource(source('s')).length, 0);
  assert.ok(issues(inspectSource(source('s', { description: { en: 'Note' } }))).includes('SOURCE_DESCRIPTION'));
});

test('valid bilingual descriptions survive canonical serialization', () => {
  const description = { en: 'Local example', fr: 'Exemple local' };
  const input = register([source('source-one', { description })]);
  assert.deepEqual(canonicalRegister(input).sources[0].description, description);
});

test('French colon requires U+00A0', () => {
  assert.ok(issues(inspectSource(source('s', { title: { en: 'Source', fr: 'Source : exemple' } }))).includes('FR_COLON'));
  assert.equal(inspectSource(source('s', { title: { en: 'Source', fr: 'Source\u00A0: exemple' } })).length, 0);
});

test('French semicolon requires U+202F', () => {
  assert.ok(issues(inspectSource(source('s', { title: { en: 'A and B', fr: 'A ; B' } }))).includes('FR_NARROW'));
  assert.equal(inspectSource(source('s', { title: { en: 'A and B', fr: 'A\u202F; B' } })).length, 0);
});

test('French question mark requires U+202F', () => {
  assert.ok(issues(inspectSource(source('s', { title: { en: 'Question', fr: 'Quelle source ?' } }))).includes('FR_NARROW'));
  assert.equal(inspectSource(source('s', { title: { en: 'Question', fr: 'Quelle source\u202F?' } })).length, 0);
});

test('French exclamation mark requires U+202F', () => {
  assert.ok(issues(inspectSource(source('s', { title: { en: 'Notice', fr: 'Attention !' } }))).includes('FR_NARROW'));
  assert.equal(inspectSource(source('s', { title: { en: 'Notice', fr: 'Attention\u202F!' } })).length, 0);
});

test('French guillemets require narrow no-break spaces inside', () => {
  assert.ok(issues(inspectSource(source('s', { title: { en: 'Quote', fr: '« exemple »' } }))).includes('FR_GUILLEMET'));
  assert.equal(inspectSource(source('s', { title: { en: 'Quote', fr: '«\u202Fexemple\u202F»' } })).length, 0);
});

test('French straight apostrophes are refused', () => {
  assert.ok(issues(inspectSource(source('s', { title: { en: 'Study', fr: "L'etude" } }))).includes('FR_APOSTROPHE'));
  assert.equal(inspectSource(source('s', { title: { en: 'Study', fr: 'L’étude' } })).length, 0);
});

test('unsupported source state is not treated as listed', () => {
  assert.ok(issues(inspectSource(source('s', { state: 'verified' }))).includes('SOURCE_STATE'));
});

test('new source requires an empty event history and listed state', () => {
  assert.equal(inspectSource(source('s')).length, 0);
  has(validateRegister(register([source('source-one', { state: 'withdrawn' })], [])), 'HISTORY_STATE');
});

test('malformed event histories are rejected', () => {
  for (const history of [null, {}, 'event', Array(REGISTER_LIMITS.history + 1).fill(null)]) {
    assert.ok(issues(inspectSource(source('s', { history }))).includes('HISTORY_LIMIT'));
  }
});

test('source events require allowed transitions and valid date', () => {
  const history = [{ action: 'withdraw', from: 'listed', to: 'withdrawn', on: TODAY }];
  assert.equal(inspectSource(source('s', { state: 'withdrawn', history })).length, 0);
  const bad = [{ ...history[0], to: 'listed' }];
  assert.ok(issues(inspectSource(source('s', { state: 'listed', history: bad }))).includes('EVENT_TRANSITION'));
});

test('source events cannot occur before retrieval', () => {
  const history = [{ action: 'withdraw', from: 'listed', to: 'withdrawn', on: '2026-11-18' }];
  assert.ok(issues(inspectSource(source('s', { state: 'withdrawn', history }))).includes('EVENT_ORDER'));
});

test('source event cannot occur after supplied today', () => {
  const history = [{ action: 'withdraw', from: 'listed', to: 'withdrawn', on: '2026-11-20' }];
  assert.ok(issues(inspectSource(source('s', { state: 'withdrawn', history }), 0, OPTIONS)).includes('FUTURE_EVENT'));
});

test('invalid history entries cannot silently become actions', () => {
  for (const event of [null, 123, {}, { action: 'withdraw' }]) {
    assert.ok(inspectSource(source('s', { history: [event] })).length > 0);
  }
});

test('unrecognized fields are rejected on source and reference objects', () => {
  has(validateRegister(register([source('source-one', { specialClaim: true })], [])), 'UNEXPECTED_FIELD');
  has(validateRegister(register([source()], [reference('r', { speculative: 'yes' })])), 'UNEXPECTED_FIELD');
});

test('unrecognized fields are rejected in history', () => {
  const history = [{ action: 'withdraw', from: 'listed', to: 'withdrawn', on: TODAY, extra: 1 }];
  has(validateRegister(register([source('source-one', { state: 'withdrawn', history })], [])), 'UNEXPECTED_FIELD');
});

test('privacy-sensitive keys are refused without reflecting their values', () => {
  const input = register([source('source-one', { api_key: 'private-raw-value' })], []);
  const checked = validateRegister(input);
  has(checked, 'PRIVATE_FIELD');
  assert.equal(JSON.stringify(checked).includes('private-raw-value'), false);
});

test('top-level unexpected keys are refused', () => {
  has(validateRegister({ ...register(), garbage: true }), 'UNEXPECTED_FIELD');
});

test('wrong version is refused instead of silently migrated', () => {
  has(validateRegister({ ...register(), version: 2 }), 'REGISTER_OBJECT');
});

test('non-object root fails without throwing', () => {
  for (const value of [null, [], '', 4, true]) {
    assert.equal(validateRegister(value).ok, false);
  }
});

test('source entries must be objects', () => {
  has(validateRegister(register([null], [])), 'SOURCE_OBJECT');
});

test('reference entries must be objects', () => {
  has(validateRegister(register([source()], [null])), 'REFERENCE_OBJECT');
});

test('source list is bounded', () => {
  const oversized = { version: 1, sources: Array(REGISTER_LIMITS.sources + 1).fill(null), references: [] };
  has(validateRegister(oversized), 'SOURCE_LIMIT');
});

test('reference list is bounded', () => {
  const oversized = { version: 1, sources: [], references: Array(REGISTER_LIMITS.references + 1).fill(null) };
  has(validateRegister(oversized), 'REFERENCE_LIMIT');
});

test('addSource makes a new collection without mutating the old one', () => {
  const before = emptyRegister();
  const result = addSource(before, source(), OPTIONS);
  assert.equal(result.ok, true);
  assert.equal(before.sources.length, 0);
  assert.equal(result.register.sources.length, 1);
});

test('addSource deep-clones the input', () => {
  const item = source();
  const result = addSource(emptyRegister(), item, OPTIONS);
  item.title.en = 'Changed after insert';
  assert.equal(result.register.sources[0].title.en, 'Synthetic source');
});

test('addSource rejects duplicate source atomically', () => {
  const before = register([source()], []);
  const result = addSource(before, source(), OPTIONS);
  assert.equal(result.ok, false);
  assert.equal(result.register, before);
  has(result, 'DUPLICATE_SOURCE');
});

test('addSource rejects bad provenance atomically', () => {
  const before = emptyRegister();
  const result = addSource(before, source('new', { licence: 'not-open' }), OPTIONS);
  assert.equal(result.register, before);
  has(result, 'SOURCE_LICENCE');
});

test('addReference requires a source already in the register', () => {
  const result = addReference(emptyRegister(), reference(), OPTIONS);
  assert.equal(result.ok, false);
  has(result, 'SOURCE_NOT_FOUND');
});

test('addReference is immutable and copies all metadata', () => {
  const before = register([source()], []);
  const entry = reference();
  const result = addReference(before, entry, OPTIONS);
  assert.equal(result.ok, true);
  assert.equal(before.references.length, 0);
  assert.deepEqual(result.register.references[0], entry);
  assert.notEqual(result.register.references[0], entry);
});

test('addReference prevents duplicate reference IDs', () => {
  const before = register();
  const result = addReference(before, reference(), OPTIONS);
  assert.equal(result.ok, false);
  assert.equal(result.register, before);
  has(result, 'DUPLICATE_REFERENCE');
});

test('addReference never upgrades UNKNOWN to YES by comparison', () => {
  const before = register();
  const result = addReference(before, reference('reference-two', { state: 'YES' }), OPTIONS);
  assert.equal(result.ok, true);
  assert.equal(result.register.references[0].state, 'UNKNOWN');
  assert.equal(result.register.references[1].state, 'YES');
});

test('withdraw action updates only source lifecycle', () => {
  const before = register();
  const result = transitionSource(before, 'source-one', 'withdraw', TODAY, OPTIONS);
  assert.equal(result.ok, true);
  assert.equal(result.register.sources[0].state, 'withdrawn');
  assert.equal(result.register.references[0].state, 'UNKNOWN');
  assert.equal(before.sources[0].state, 'listed');
});

test('source transition records event origin, destination and day', () => {
  const result = transitionSource(register(), 'source-one', 'request-review', TODAY, OPTIONS);
  assert.deepEqual(result.register.sources[0].history, [{
    action: 'request-review', from: 'listed', to: 'needs-review', on: TODAY,
  }]);
});

test('retired sources cannot be withdrawn without restoration', () => {
  const first = transitionSource(register(), 'source-one', 'retire', TODAY, OPTIONS);
  const second = transitionSource(first.register, 'source-one', 'withdraw', TODAY, OPTIONS);
  assert.equal(second.ok, false);
  assert.equal(second.register, first.register);
  has(second, 'ACTION_NOT_ALLOWED');
});

test('a retired source can return only to needs-review', () => {
  const first = transitionSource(register(), 'source-one', 'retire', TODAY, OPTIONS);
  const next = transitionSource(first.register, 'source-one', 'restore', TODAY, OPTIONS);
  assert.equal(next.ok, true);
  assert.equal(next.register.sources[0].state, 'needs-review');
});

test('a withdrawn source can request a new review', () => {
  const first = transitionSource(register(), 'source-one', 'withdraw', TODAY, OPTIONS);
  const next = transitionSource(first.register, 'source-one', 'request-review', TODAY, OPTIONS);
  assert.equal(next.ok, true);
  assert.equal(next.register.sources[0].state, 'needs-review');
});

test('review can restore a source to listed without changing its claims', () => {
  const first = transitionSource(register(), 'source-one', 'request-review', TODAY, OPTIONS);
  const second = transitionSource(first.register, 'source-one', 'restore', TODAY, OPTIONS);
  assert.equal(second.ok, true);
  assert.equal(second.register.sources[0].state, 'listed');
  assert.equal(second.register.references[0].state, 'UNKNOWN');
});

test('transition refuses unknown source ID', () => {
  const before = register();
  const result = transitionSource(before, 'missing', 'withdraw', TODAY, OPTIONS);
  assert.equal(result.ok, false);
  has(result, 'SOURCE_NOT_FOUND');
});

test('transition refuses an unrecognized action', () => {
  const before = register();
  const result = transitionSource(before, 'source-one', 'verify', TODAY, OPTIONS);
  assert.equal(result.ok, false);
  has(result, 'ACTION_INVALID');
});

test('transition refuses impossible action dates', () => {
  const result = transitionSource(register(), 'source-one', 'withdraw', '2026-02-30', OPTIONS);
  has(result, 'ACTION_INVALID');
});

test('transition refuses a future event', () => {
  const result = transitionSource(register(), 'source-one', 'withdraw', '2026-11-20', OPTIONS);
  has(result, 'FUTURE_EVENT');
});

test('transition cannot predate source retrieval', () => {
  const result = transitionSource(register(), 'source-one', 'withdraw', '2026-11-18', OPTIONS);
  has(result, 'EVENT_ORDER');
});

test('transition cannot exceed bounded history', () => {
  let next = register();
  for (let i = 0; i < REGISTER_LIMITS.history; i += 1) {
    const action = i % 2 === 0 ? 'request-review' : 'restore';
    const updated = transitionSource(next, 'source-one', action, TODAY, OPTIONS);
    assert.equal(updated.ok, true, `event ${i}`);
    next = updated.register;
  }
  has(transitionSource(next, 'source-one', 'request-review', TODAY, OPTIONS), 'HISTORY_LIMIT');
});

test('sourceDependents returns sorted minimal identifiers without private data', () => {
  const input = register([source()], [reference('z'), reference('a')]);
  const result = sourceDependents(input, 'source-one', OPTIONS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.dependents.map((entry) => entry.id), ['a', 'z']);
  assert.deepEqual(Object.keys(result.dependents[0]).sort(), ['field', 'id', 'recordId', 'state']);
});

test('sourceDependents refuses invalid register instead of partial list', () => {
  const invalid = register([source('source-one', { url: 'http://example.org' })]);
  const result = sourceDependents(invalid, 'source-one', OPTIONS);
  assert.equal(result.ok, false);
  assert.equal(result.dependents, null);
});

test('sourceHealth counts source status independently of claims', () => {
  const before = sourceHealth(register(), OPTIONS).summary;
  const changed = transitionSource(register(), 'source-one', 'withdraw', TODAY, OPTIONS);
  const after = sourceHealth(changed.register, OPTIONS).summary;
  assert.equal(before.claims.UNKNOWN, 1);
  assert.equal(after.claims.UNKNOWN, 1);
  assert.equal(after.status.withdrawn, 1);
  assert.equal(after.reviewNeeded.length, 1);
});

test('sourceHealth records no review need for a listed source', () => {
  const summary = sourceHealth(register(), OPTIONS).summary;
  assert.deepEqual(summary.reviewNeeded, []);
  assert.equal(summary.status.listed, 1);
});

test('sourceHealth has independent source dependency counts', () => {
  const input = register([source('source-one'), source('source-two')],
    [reference('one'), reference('two', { sourceId: 'source-two' }), reference('three')]);
  const summary = sourceHealth(input, OPTIONS).summary;
  assert.deepEqual(summary.dependencies, { 'source-one': 2, 'source-two': 1 });
  assert.equal(summary.references, 3);
});

test('canonical serialization sorts records without mutating inputs', () => {
  const input = register([source('z'), source('a')], []);
  const canonical = canonicalRegister(input);
  assert.deepEqual(canonical.sources.map((entry) => entry.id), ['a', 'z']);
  assert.deepEqual(input.sources.map((entry) => entry.id), ['z', 'a']);
});

test('fingerprint is invariant to record ordering', () => {
  const a = register([source('z'), source('a')], []);
  const b = register([source('a'), source('z')], []);
  assert.equal(registerFingerprint(a, OPTIONS).fingerprint, registerFingerprint(b, OPTIONS).fingerprint);
});

test('fingerprint changes when evidence source changes', () => {
  const a = register();
  const b = register([source('source-one', { url: 'https://other.example.org' })]);
  assert.notEqual(registerFingerprint(a, OPTIONS).fingerprint, registerFingerprint(b, OPTIONS).fingerprint);
});

test('fingerprint is never presented as a factual source verification', () => {
  const result = registerFingerprint(register(), OPTIONS);
  assert.equal(result.ok, true);
  assert.match(result.fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test('invalid register has no fingerprint', () => {
  const result = registerFingerprint(register([source('source-one', { tier: 'UNKNOWN' })]));
  assert.equal(result.ok, false);
  assert.equal(result.fingerprint, null);
});

test('serialized register is deterministic across orderings', () => {
  const a = register([source('z'), source('a')], []);
  const b = register([source('a'), source('z')], []);
  assert.equal(serializeRegister(a).text, serializeRegister(b).text);
});

test('serialized register carries source, licence, date and tier per record', () => {
  const output = serializeRegister(register(), OPTIONS);
  const parsed = JSON.parse(output.text);
  for (const field of ['url', 'licence', 'retrievedOn', 'tier']) {
    assert.ok(Object.hasOwn(parsed.sources[0], field), field);
  }
});

test('invalid JSON produces explicit problems and no register', () => {
  const result = parseRegister('{');
  assert.equal(result.ok, false);
  assert.equal(result.register, null);
  has(result, 'INVALID_JSON');
});

test('invalid register JSON does not return a supposedly accepted object', () => {
  const result = parseRegister(JSON.stringify(register([source('s', { licence: 'private' })])));
  assert.equal(result.register, null);
  has(result, 'SOURCE_LICENCE');
});

test('serialization and parsing preserve claim state exactly', () => {
  const input = register();
  const serialized = serializeRegister(input, OPTIONS);
  const parsed = parseRegister(serialized.text, OPTIONS);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.register.references[0].state, 'UNKNOWN');
});

test('parsing refuses non-text inputs', () => {
  for (const input of [null, undefined, {}, [], 23]) {
    has(parseRegister(input), 'INPUT_LIMIT');
  }
});

test('parsing refuses oversized payloads', () => {
  has(parseRegister('x'.repeat(REGISTER_LIMITS.bytes + 1)), 'INPUT_LIMIT');
});

test('merging an identical register yields the same records', () => {
  const base = register();
  const result = mergeRegisters(base, clone(base), clone(base), OPTIONS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.register, base);
});

test('independent source additions are merged', () => {
  const base = register([source('source-one')], []);
  const local = register([source('source-one'), source('left')], []);
  const remote = register([source('source-one'), source('right')], []);
  const merged = mergeRegisters(base, local, remote, OPTIONS);
  assert.equal(merged.ok, true);
  assert.deepEqual(merged.register.sources.map((s) => s.id), ['left', 'right', 'source-one']);
});

test('identical concurrent additions are not duplicated', () => {
  const base = emptyRegister();
  const left = register([source('shared')], []);
  const merged = mergeRegisters(base, left, clone(left), OPTIONS);
  assert.equal(merged.ok, true);
  assert.equal(merged.register.sources.length, 1);
});

test('divergent concurrent additions refuse silent selection', () => {
  const base = emptyRegister();
  const left = register([source('shared', { url: 'https://left.example.org' })], []);
  const right = register([source('shared', { url: 'https://right.example.org' })], []);
  const merged = mergeRegisters(base, left, right, OPTIONS);
  assert.equal(merged.ok, false);
  assert.equal(merged.register, null);
  assert.equal(merged.conflicts[0].code, 'CONCURRENT_EDIT');
});

test('independent source updates on separate ids survive merge', () => {
  const a = source('a');
  const b = source('b');
  const base = register([a, b], []);
  const left = register([{ ...a, url: 'https://left.example.org' }, b], []);
  const right = register([a, { ...b, url: 'https://right.example.org' }], []);
  const merged = mergeRegisters(base, left, right, OPTIONS);
  assert.equal(merged.ok, true);
  assert.equal(merged.register.sources[0].url, 'https://left.example.org');
  assert.equal(merged.register.sources[1].url, 'https://right.example.org');
});

test('concurrent edits to the same source refuse automatic resolution', () => {
  const base = register([source()], []);
  const left = register([source('source-one', { url: 'https://left.example.org' })], []);
  const right = register([source('source-one', { url: 'https://right.example.org' })], []);
  const merged = mergeRegisters(base, left, right, OPTIONS);
  assert.equal(merged.ok, false);
  has(merged, 'MERGE_CONFLICT');
});

test('delete versus changed source is a conflict, not a deletion', () => {
  const base = register([source()], []);
  const left = emptyRegister();
  const right = register([source('source-one', { url: 'https://changed.example.org' })], []);
  const merged = mergeRegisters(base, left, right, OPTIONS);
  assert.equal(merged.ok, false);
  assert.equal(merged.conflicts[0].id, 'source-one');
});

test('deletion agreed by both sides removes an unused source', () => {
  const base = register([source()], []);
  const result = mergeRegisters(base, emptyRegister(), emptyRegister(), OPTIONS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.register.sources, []);
});

test('merging refuses dangling references after source removal', () => {
  const base = register();
  const left = register([], []);
  const right = register([source()], [reference('reference-one', { state: 'YES' })]);
  const merged = mergeRegisters(base, left, right, OPTIONS);
  assert.equal(merged.ok, false);
});

test('invalid merge input returns snapshot-labelled issues', () => {
  const result = mergeRegisters(register(), register([source('source-one', { url: 'http://example.org' })]), register(), OPTIONS);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((entry) => entry.snapshot === 'local'));
});

test('merge never mutates base, local or remote', () => {
  const base = register();
  const before = JSON.stringify(base);
  mergeRegisters(base, clone(base), clone(base), OPTIONS);
  assert.equal(JSON.stringify(base), before);
});

test('review transitions never change physical accessibility claims', () => {
  let input = register();
  for (const action of ['request-review', 'restore', 'withdraw', 'request-review']) {
    const result = transitionSource(input, 'source-one', action, TODAY, OPTIONS);
    assert.equal(result.ok, true, action);
    input = result.register;
    assert.equal(input.references[0].state, 'UNKNOWN');
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INCIDENT_VERSION, INCIDENT_STATUSES, INCIDENT_SEVERITIES,
  INCIDENT_AREAS, INCIDENT_ACTIONS, INCIDENT_LIMITS, TRANSITIONS,
  plain, pointer, validId, safeUrl, unicodeIssues, textIssues,
  findPrivateKeys, sourceIssues, eventIssues, 
  inspectIncidentRegister, newIncidentRegister, canonicalIncident,
  incidentFingerprint, parseIncidents,
  serializeIncidents, appendIncident, transitionIncident, incidentSummary,
} from './offline-release-incidents.mjs';
import { TODAY, fixtureSource, fixtureIncident, fixtureRegister, clone } from './offline-release-incident-fixtures.mjs';

const codes = (value) => value.problems.map((item) => item.code);
const set = (key, value) => ({ ...fixtureIncident(), [key]: value });

test('the module exposes stable bounded incident vocabulary', () => {
  assert.equal(INCIDENT_VERSION, 1);
  assert.equal(new Set(INCIDENT_STATUSES).size, INCIDENT_STATUSES.length);
  assert.equal(new Set(INCIDENT_AREAS).size, INCIDENT_AREAS.length);
  assert.equal(new Set(INCIDENT_ACTIONS).size, INCIDENT_ACTIONS.length);
  assert.equal(new Set(INCIDENT_SEVERITIES).size, INCIDENT_SEVERITIES.length);
  assert.ok(INCIDENT_LIMITS.maxInputBytes < 50_000_000);
  assert.ok(INCIDENT_LIMITS.maxIncidents > 0);
  assert.ok(INCIDENT_LIMITS.maxEvents > 0);
});

test('new register starts empty and remains valid', () => {
  assert.deepEqual(newIncidentRegister(), fixtureRegister());
  assert.equal(inspectIncidentRegister(newIncidentRegister(), { today: TODAY }).ok, true);
  assert.equal(incidentSummary(newIncidentRegister()).summary.total, 0);
});

test('plain-object inspection rejects arrays and custom instances', () => {
  assert.equal(plain({}), true);
  assert.equal(plain(Object.create(null)), true);
  assert.equal(plain([]), false);
  assert.equal(plain(null), false);
  assert.equal(plain(new Date()), false);
  assert.equal(plain(Object.create({ a: 1 })), false);
});

test('pointer encoding handles JSON pointer escapes', () => {
  assert.equal(pointer('a/b'), 'a~1b');
  assert.equal(pointer('a~b'), 'a~0b');
  assert.equal(pointer('a/b~c'), 'a~1b~0c');
  assert.equal(pointer(12), '12');
});

test('incident IDs are bounded and reject prototype access', () => {
  for (const id of ['abc', 'a.b', 'a:b', 'a_b', 'a-b', '1']) {
    assert.equal(validId(id), true, id);
  }
  for (const id of ['__proto__', 'prototype', 'constructor',
    '', '_prefix', '/path', 'space in id', 'x'.repeat(129), 12, null]) {
    assert.equal(validId(id), false, String(id));
  }
});

test('source URL policy accepts safe HTTPS without fragments', () => {
  assert.equal(safeUrl('https://example.org/report'), true);
  assert.equal(safeUrl('https://example.org:443/report'), true);
  assert.equal(safeUrl('https://sub.example.org/?q=one'), true);
  for (const value of [
    'http://example.org/report', 'file:///tmp/demo', 'javascript:alert(1)',
    'https://example.org/#private', 'https://user:password@example.org/',
    'https://localhost/', 'https://dev.localhost/', 'https://127.0.0.1/',
    'https://[::1]/', 'https://example.org/\n', '', 12, null,
  ]) assert.equal(safeUrl(value), false, String(value));
});

test('French spacing uses NBSP for colon only', () => {
  assert.deepEqual(unicodeIssues('Résumé\u00A0: disponible', '/fr'), []);
  assert.ok(unicodeIssues('Résumé : disponible', '/fr').some((x) => x.code === 'FR_COLON_NBSP'));
  assert.ok(unicodeIssues('Résumé: disponible', '/fr').some((x) => x.code === 'FR_COLON_NBSP'));
  assert.equal(unicodeIssues('https://example.org', '/fr').length > 0, true);
});

test('French narrow spacing covers punctuation and guillemets', () => {
  assert.deepEqual(unicodeIssues('«\u202Ftexte\u202F»\u202F! Oui\u202F? Oui\u202F;', '/fr'), []);
  for (const text of ['«texte\u202F»', '«\u00A0texte\u202F»',
    '«\u202Ftexte»', 'Attention!', 'Question ?', 'Un; deux']) {
    assert.ok(unicodeIssues(text, '/fr').length > 0, text);
  }
});

test('French contractions require curly apostrophes', () => {
  assert.deepEqual(unicodeIssues('L’App n’affirme rien.', '/fr'), []);
  assert.ok(unicodeIssues("L'App n'affirme rien.", '/fr').some((x) => x.code === 'FR_APOSTROPHE'));
});

test('bilingual labels cannot be empty or one-sided', () => {
  assert.deepEqual(textIssues({ en: 'Sample', fr: 'Exemple' }, '/title'), []);
  for (const value of [{ en: 'Sample' }, { en: ' ', fr: 'Exemple' },
    { en: 'Sample', fr: '' }, { en: 'Sample', fr: 'Exemple', es: 'Ejemplo' },
    null, [], 'string', { en: 'x'.repeat(3000), fr: 'Texte' }]) {
    assert.ok(textIssues(value, '/title').some((x) => x.code === 'BILINGUAL_TEXT_REQUIRED'));
  }
});

test('private detection returns paths and excludes values', () => {
  const input = { incidents: [{ email: 'john-private', nested: { api_key: 'private-secret' } }] };
  const issues = findPrivateKeys(input);
  assert.deepEqual(issues.map((entry) => entry.path), ['/incidents/0/email', '/incidents/0/nested/api_key']);
  assert.equal(JSON.stringify(issues).includes('john-private'), false);
  assert.equal(JSON.stringify(issues).includes('private-secret'), false);
});

test('private detection catches object cycles safely', () => {
  const input = { id: 'x' };
  input.self = input;
  assert.ok(findPrivateKeys(input).some((x) => x.code === 'CYCLE'));
});

test('private detection accepts repeated noncyclic objects', () => {
  const one = { title: 'Synthetic' };
  assert.deepEqual(findPrivateKeys({ a: one, b: one }), []);
});

test('valid source requires full provenance', () => {
  assert.deepEqual(sourceIssues(fixtureSource(), '/source', TODAY), []);
  for (const [key, value, code] of [
    ['id', '', 'SOURCE_ID'], ['source', 'http://example.org', 'SOURCE_URL'],
    ['licence', 'all-rights-reserved', 'OPEN_LICENCE_REQUIRED'],
    ['retrievedOn', '2026-02-30', 'RETRIEVAL_DATE_REQUIRED'],
    ['tier', 'UNKNOWN', 'TIER_REQUIRED'],
  ]) assert.ok(sourceIssues(fixtureSource('source-1', { [key]: value }), '/source', TODAY)
    .some((x) => x.code === code), key);
});

test('future source retrieval is not accepted', () => {
  const value = fixtureSource('source-1', { retrievedOn: '2026-11-20' });
  assert.ok(sourceIssues(value, '/source', TODAY).some((x) => x.code === 'RETRIEVAL_DATE_REQUIRED'));
});

test('extra source keys cannot bypass privacy controls', () => {
  assert.ok(sourceIssues({ ...fixtureSource(), unrelated: true }, '/source')
    .some((x) => x.code === 'EXTRA_FIELD'));
});

test('synthetic incident has explicit UNKNOWN without inferred facts', () => {
  assert.equal(inspectIncidentRegister(fixtureRegister(fixtureIncident()), { today: TODAY }).ok, true);
  assert.equal(fixtureIncident().claimState, 'UNKNOWN');
  assert.equal(incidentSummary(fixtureRegister(fixtureIncident())).summary.claimState, 'UNKNOWN');
});

test('record claims must remain UNKNOWN', () => {
  for (const value of ['YES', 'NO', 'Verified', 'yes', true, false, 0, null]) {
    const result = inspectIncidentRegister(fixtureRegister(set('claimState', value)));
    assert.ok(codes(result).includes('UNKNOWN_REQUIRED'), String(value));
  }
});

test('incident status must be supported', () => {
  assert.ok(codes(inspectIncidentRegister(fixtureRegister(set('status', 'queued'))))
    .includes('INCIDENT_STATUS'));
});

test('incident area must be supported', () => {
  assert.ok(codes(inspectIncidentRegister(fixtureRegister(set('area', 'unknown-area'))))
    .includes('INCIDENT_AREA'));
});

test('incident severity must be supported', () => {
  assert.ok(codes(inspectIncidentRegister(fixtureRegister(set('severity', 'urgent'))))
    .includes('INCIDENT_SEVERITY'));
});

test('source references must point to supplied evidence', () => {
  assert.ok(codes(inspectIncidentRegister(fixtureRegister(set('sourceRefs', ['missing']))))
    .includes('SOURCE_REFS'));
  assert.ok(codes(inspectIncidentRegister(fixtureRegister(set('sourceRefs', []))))
    .includes('SOURCE_REFS'));
});

test('duplicated source IDs are rejected', () => {
  const value = set('sources', [fixtureSource(), fixtureSource()]);
  assert.ok(codes(inspectIncidentRegister(fixtureRegister(value))).includes('DUPLICATE_SOURCE'));
});

test('missing sources invalidate the incident even when UNKNOWN', () => {
  assert.ok(codes(inspectIncidentRegister(fixtureRegister(set('sources', []))))
    .includes('SOURCES_REQUIRED'));
});

test('createdOn cannot be future relative to supplied date', () => {
  const result = inspectIncidentRegister(fixtureRegister(set('createdOn', '2026-11-20')), { today: TODAY });
  assert.ok(codes(result).includes('CREATED_ON'));
});

test('updatedOn cannot precede createdOn', () => {
  const result = inspectIncidentRegister(fixtureRegister(set('updatedOn', '2026-11-18')));
  assert.ok(codes(result).includes('UPDATED_ON'));
});

test('unexplained updates without history are refused', () => {
  const result = inspectIncidentRegister(fixtureRegister(set('updatedOn', '2026-11-20')));
  assert.ok(codes(result).includes('UNEXPLAINED_UPDATE'));
});

test('related IDs must exist in the register', () => {
  const value = set('relatedIds', ['nonexistent']);
  assert.ok(codes(inspectIncidentRegister(fixtureRegister(value))).includes('MISSING_RELATED'));
});

test('self references are refused', () => {
  const value = set('relatedIds', ['incident-1']);
  assert.ok(codes(inspectIncidentRegister(fixtureRegister(value))).includes('RELATED_IDS'));
});

test('two incident records can be related without changing claims', () => {
  const one = set('relatedIds', ['incident-2']);
  const two = fixtureIncident('incident-2');
  const value = fixtureRegister(one, two);
  assert.equal(inspectIncidentRegister(value).ok, true);
  assert.equal(value.incidents[0].claimState, 'UNKNOWN');
});

test('duplicate incident IDs fail closed', () => {
  const value = fixtureRegister(fixtureIncident(), fixtureIncident());
  assert.ok(codes(inspectIncidentRegister(value)).includes('DUPLICATE_INCIDENT'));
});

test('register shape cannot contain unrelated top-level values', () => {
  const value = { ...fixtureRegister(fixtureIncident()), secretField: 'private' };
  assert.ok(codes(inspectIncidentRegister(value)).includes('EXTRA_FIELD'));
});

test('event transition table covers all approved workflow actions', () => {
  for (const [from, transitions] of Object.entries(TRANSITIONS)) {
    for (const [action, to] of Object.entries(transitions)) {
      const incident = fixtureIncident();
      incident.status = from;
      assert.equal(typeof action, 'string');
      assert.equal(INCIDENT_STATUSES.includes(to), true);
    }
  }
});

test('triage transition is atomic and adds immutable history', () => {
  const before = fixtureRegister(fixtureIncident());
  const result = transitionIncident(before, 'incident-1', 'triage', TODAY, ['source-1']);
  assert.equal(result.ok, true);
  assert.equal(result.register.incidents[0].status, 'triaged');
  assert.equal(result.register.incidents[0].history[0].from, 'open');
  assert.equal(result.register.incidents[0].history[0].to, 'triaged');
  assert.equal(before.incidents[0].status, 'open');
  assert.equal(before.incidents[0].history.length, 0);
});

test('triage does not change the claim state or evidence', () => {
  const before = fixtureRegister(fixtureIncident());
  const after = transitionIncident(before, 'incident-1', 'triage', TODAY, ['source-1']);
  assert.equal(after.register.incidents[0].claimState, 'UNKNOWN');
  assert.deepEqual(after.register.incidents[0].sources, before.incidents[0].sources);
});

test('illegal transition does not mutate original register', () => {
  const before = fixtureRegister(fixtureIncident());
  const after = transitionIncident(before, 'incident-1', 'resolve', TODAY, ['source-1']);
  assert.equal(after.ok, false);
  assert.equal(after.register, before);
  assert.ok(codes(after).includes('ILLEGAL_TRANSITION'));
});

test('transition rejects nonexistent incident', () => {
  const before = fixtureRegister(fixtureIncident());
  const after = transitionIncident(before, 'other', 'triage', TODAY, ['source-1']);
  assert.equal(after.ok, false);
  assert.ok(codes(after).includes('INCIDENT_NOT_FOUND'));
});

test('transition requires an evidence reference', () => {
  const before = fixtureRegister(fixtureIncident());
  const after = transitionIncident(before, 'incident-1', 'triage', TODAY, ['not-present']);
  assert.equal(after.ok, false);
  assert.ok(codes(after).includes('EVENT_SOURCES'));
});

test('sequential transitions preserve history chronology', () => {
  const before = fixtureRegister(fixtureIncident());
  const step1 = transitionIncident(before, 'incident-1', 'triage', TODAY, ['source-1']);
  const step2 = transitionIncident(step1.register, 'incident-1', 'resolve', TODAY, ['source-1']);
  const step3 = transitionIncident(step2.register, 'incident-1', 'close', TODAY, ['source-1']);
  assert.equal(step3.ok, true);
  assert.equal(step3.register.incidents[0].status, 'closed');
  assert.deepEqual(step3.register.incidents[0].history.map((x) => x.action), ['triage', 'resolve', 'close']);
});

test('event inspection catches backwards dates', () => {
  const result = eventIssues({ action: 'triage', on: '2026-11-17',
    from: 'open', to: 'triaged', sourceRefs: ['source-1'] }, '/event',
  'open', '2026-11-19', new Set(['source-1']), TODAY);
  assert.ok(result.some((x) => x.code === 'EVENT_DATE'));
});

test('serialization uses canonical deterministic order', () => {
  const a = fixtureRegister(fixtureIncident('b'), fixtureIncident('a'));
  const b = fixtureRegister(fixtureIncident('a'), fixtureIncident('b'));
  assert.equal(serializeIncidents(a).text, serializeIncidents(b).text);
});

test('fingerprints are identical across item input ordering', () => {
  const a = fixtureRegister(fixtureIncident('b'), fixtureIncident('a'));
  const b = fixtureRegister(fixtureIncident('a'), fixtureIncident('b'));
  assert.equal(incidentFingerprint(a).fingerprint, incidentFingerprint(b).fingerprint);
});

test('fingerprints change when source retrieval changes', () => {
  const a = fixtureRegister(fixtureIncident());
  const b = clone(a);
  b.incidents[0].sources[0].retrievedOn = '2026-11-18';
  assert.notEqual(incidentFingerprint(a).fingerprint, incidentFingerprint(b).fingerprint);
});

test('canonical incident sorts source references without mutating input', () => {
  const item = fixtureIncident('one', {
    sourceRefs: ['source-2', 'source-1'],
    sources: [fixtureSource('source-2'), fixtureSource('source-1')],
  });
  const result = canonicalIncident(item);
  assert.deepEqual(result.sourceRefs, ['source-1', 'source-2']);
  assert.deepEqual(result.sources.map((x) => x.id), ['source-1', 'source-2']);
  assert.equal(item.sourceRefs[0], 'source-2');
});

test('parse/serialize roundtrip does not promote UNKNOWN', () => {
  const before = fixtureRegister(fixtureIncident());
  const serialized = serializeIncidents(before);
  const parsed = parseIncidents(serialized.text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.register.incidents[0].claimState, 'UNKNOWN');
});

test('parsing refuses invalid JSON and oversized text', () => {
  assert.ok(codes(parseIncidents('{')).includes('INVALID_JSON'));
  assert.ok(codes(parseIncidents('x'.repeat(INCIDENT_LIMITS.maxInputBytes + 1)))
    .includes('INPUT_LIMIT'));
});

test('append is immutable and rejects duplicate IDs', () => {
  const before = fixtureRegister(fixtureIncident());
  const added = appendIncident(before, fixtureIncident('another'));
  assert.equal(added.ok, true);
  assert.equal(before.incidents.length, 1);
  assert.equal(added.register.incidents.length, 2);
  const duplicate = appendIncident(added.register, fixtureIncident('another'));
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.register, added.register);
});

test('invalid register never gets a seemingly clean summary', () => {
  const bad = fixtureRegister(set('sources', []));
  const summary = incidentSummary(bad);
  assert.equal(summary.ok, false);
  assert.equal(summary.summary, null);
});

test('summaries count incident severity and status independently', () => {
  const one = fixtureIncident('one', { severity: 'high' });
  const two = fixtureIncident('two', { severity: 'critical' });
  const result = incidentSummary(fixtureRegister(one, two));
  assert.equal(result.summary.bySeverity.high, 1);
  assert.equal(result.summary.bySeverity.critical, 1);
  assert.equal(result.summary.byStatus.open, 2);
  assert.equal(result.summary.distinctSourceIds, 1);
});

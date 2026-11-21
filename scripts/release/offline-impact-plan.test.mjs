import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IMPACT_VERSION, IMPACT_REASONS, compareEvidenceItem,
  planQueueImpact, planSourceWithdrawal, validateImpactPacket,
  toImpactPacket, summarizeImpact,
} from './offline-impact-plan.mjs';

const DAY = '2026-11-19';
const source = 'https://example.org/observations';
function item(id = 'review-a', change = {}) {
  return {
    id, recordId: 'synthetic-place', claimKey: 'stepFreeEntrance',
    reason: 'unknown-claim', status: 'pending', state: 'UNKNOWN',
    createdOn: '2026-11-18',
    label: { en: 'Synthetic entrance', fr: 'Entrée fictive' },
    provenance: { source, licence: 'CC0-1.0', retrievedOn: '2026-11-18', tier: 0,
      sourceDate: '2026-11-17' }, history: [], ...change,
  };
}
function queue(...items) { return { version: 1, items }; }
function codes(result) { return result.problems.map((entry) => entry.code); }
function reasons(result) { return result.impacts.map((entry) => entry.reason); }
function withEvidence(record, changes) {
  return { ...record, provenance: { ...record.provenance, ...changes } };
}
function reviewed(record, state) { return { ...record, state }; }
function plan(before, after, options = {}) {
  return planQueueImpact(queue(...before), queue(...after), options);
}

test('impact vocabulary is unique and contains every documented reason', () => {
  assert.equal(IMPACT_VERSION, 1);
  assert.equal(IMPACT_REASONS.length, new Set(IMPACT_REASONS).size);
  for (const name of ['SOURCE_REMOVED', 'LICENCE_CHANGED', 'CLAIM_CHANGED',
    'REVIEW_DATE_PASSED', 'REVIEW_ITEM_REMOVED']) {
    assert.ok(IMPACT_REASONS.includes(name));
  }
});

test('empty input queues produce no impacts and no fake evidence', () => {
  const result = plan([], []);
  assert.equal(result.ok, true);
  assert.equal(result.summary.totalImpacts, 0);
  assert.equal(result.summary.unknownClaims, 0);
  assert.deepEqual(result.impacts, []);
});

test('identical records do not produce impacts', () => {
  const result = plan([item()], [item()]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.impacts, []);
});

test('input order does not affect the report ordering', () => {
  const left = plan([item('z'), item('a')], [item('a'), item('z'), item('new')]);
  const right = plan([item('a'), item('z')], [item('new'), item('z'), item('a')]);
  assert.deepEqual(left, right);
});

test('new review item is review work, not a source confirmation', () => {
  const result = plan([], [item()]);
  assert.deepEqual(reasons(result), ['NEW_REVIEW_ITEM']);
  assert.equal(result.impacts[0].state, 'UNKNOWN');
  assert.equal(result.impacts[0].action, 'HUMAN_REVIEW_REQUIRED');
  assert.equal(result.summary.unknownClaims, 1);
});

test('removed item does not imply a location became inaccessible', () => {
  const result = plan([item()], []);
  assert.deepEqual(reasons(result), ['REVIEW_ITEM_REMOVED']);
  assert.equal(result.impacts[0].state, 'UNKNOWN');
  assert.equal(result.summary.unknownClaims, 0);
});

test('source replacement records both URLs without fetching either', () => {
  const start = item();
  const changed = withEvidence(start, { source: 'https://example.net/new' });
  const result = plan([start], [changed]);
  assert.deepEqual(reasons(result), ['SOURCE_REPLACED']);
  assert.equal(result.impacts[0].before, source);
  assert.equal(result.impacts[0].after, 'https://example.net/new');
});

test('licence changes are blocking instead of silently accepted', () => {
  const start = item();
  const changed = withEvidence(start, { licence: 'CC-BY-4.0' });
  const result = plan([start], [changed]);
  assert.deepEqual(reasons(result), ['LICENCE_CHANGED']);
  assert.equal(result.summary.blocking, 1);
});

test('retrieval date changes are recorded without changing feature state', () => {
  const start = item();
  const result = plan([start], [withEvidence(start, { retrievedOn: DAY })]);
  assert.deepEqual(reasons(result), ['RETRIEVAL_CHANGED']);
  assert.equal(result.impacts[0].state, 'UNKNOWN');
});

test('canonical tier change requires human review', () => {
  const start = item();
  const result = plan([start], [withEvidence(start, { tier: 1 })]);
  assert.deepEqual(reasons(result), ['TIER_CHANGED']);
  assert.equal(result.impacts[0].level, 'review');
});

test('source observation date moves are visible', () => {
  const start = item();
  const result = plan([start], [withEvidence(start, { sourceDate: '2026-11-18' })]);
  assert.deepEqual(reasons(result), ['SOURCE_DATE_CHANGED']);
});

test('claim transitions stay explicit in both directions', () => {
  const start = item();
  const yes = reviewed(start, 'YES');
  const gained = plan([start], [yes]);
  const lost = plan([yes], [start]);
  assert.deepEqual(reasons(gained), ['CLAIM_CHANGED']);
  assert.deepEqual(reasons(lost), ['CLAIM_CHANGED']);
  assert.equal(lost.impacts[0].after, 'UNKNOWN');
  assert.equal(gained.impacts[0].before, 'UNKNOWN');
});

test('changing workflow status alone does not alter evidence', () => {
  const start = item();
  const result = plan([start], [{ ...start, status: 'closed' }]);
  assert.equal(result.ok, true);
  assert.equal(result.impacts.length, 0);
});

test('renaming a bilingual display label does not imply evidence changed', () => {
  const start = item();
  const result = plan([start], [{ ...start,
    label: { en: 'Illustrative entrance', fr: 'Entrée illustrative' } }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.impacts, []);
});

test('identical source sets do not trigger false source loss', () => {
  const start = item();
  const result = planSourceWithdrawal(queue(start), 'https://example.net/different');
  assert.equal(result.ok, true);
  assert.equal(result.summary.blocking, 0);
  assert.deepEqual(result.impacts, []);
});

test('withdrawn source affects every dependent item', () => {
  const data = [item('a'), item('b'), withEvidence(item('c'), { source: 'https://example.net/elsewhere' })];
  const result = planSourceWithdrawal(queue(...data), source);
  assert.equal(result.summary.affectedItems, 2);
  assert.deepEqual(result.impacts.map((entry) => entry.id), ['a', 'b']);
  assert.deepEqual(reasons(result), ['SOURCE_REMOVED', 'SOURCE_REMOVED']);
});

test('source withdrawal leaves original queue untouched', () => {
  const original = queue(item());
  const snapshot = structuredClone(original);
  planSourceWithdrawal(original, source);
  assert.deepEqual(original, snapshot);
});

test('invalid source URL is refused for withdrawal requests', () => {
  const result = planSourceWithdrawal(queue(item()), 'http://example.org/source');
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('SOURCE_INVALID'));
  assert.deepEqual(result.impacts, []);
});

test('invalid earlier queue fails closed', () => {
  const bad = item();
  bad.provenance.licence = '';
  const result = plan([bad], [item()]);
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.ok(codes(result).some((code) => code.startsWith('BEFORE_')));
});

test('invalid later queue fails closed', () => {
  const bad = item();
  bad.state = 'guessed';
  const result = plan([item()], [bad]);
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
  assert.ok(codes(result).some((code) => code.startsWith('AFTER_')));
});

test('neither invalid source nor private fields are reflected in the report', () => {
  const bad = item();
  bad.token = 'sensitive-secret-value';
  const result = plan([item()], [bad]);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes('sensitive-secret-value'), false);
});

test('review window flags evidence older than selected number of days', () => {
  const result = plan([item()], [item()], { today: DAY, reviewAfterDays: 0 });
  assert.deepEqual(reasons(result), ['REVIEW_DATE_PASSED']);
});

test('review window does not flag evidence exactly on deadline', () => {
  const result = plan([item()], [item()], { today: DAY, reviewAfterDays: 1 });
  assert.deepEqual(reasons(result), []);
});

test('review window understands leap-year dates', () => {
  const original = withEvidence({ ...item(), createdOn: '2024-02-28' }, { retrievedOn: '2024-02-29', sourceDate: '2024-02-28' });
  const result = plan([original], [original], { today: '2024-03-01', reviewAfterDays: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.impacts.length, 0);
});

test('invalid today parameter does not leak partial impacts', () => {
  const result = plan([], [item()], { today: 'tomorrow' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.impacts, []);
  assert.ok(codes(result).includes('TODAY_INVALID'));
});

test('invalid review window does not produce an impact', () => {
  for (const window of [-1, 1.25, 40000, '7', NaN]) {
    const result = plan([item()], [item()], { today: DAY, reviewAfterDays: window });
    assert.equal(result.ok, false, String(window));
    assert.ok(codes(result).includes('REVIEW_WINDOW_INVALID'));
  }
});

test('packet creation is explicit and does not return aliases', () => {
  const result = plan([], [item()]);
  const packet = toImpactPacket(result);
  assert.equal(packet.version, IMPACT_VERSION);
  assert.notEqual(packet.impacts, result.impacts);
  assert.notEqual(packet.impacts[0], result.impacts[0]);
});

test('invalid plan does not become a packet', () => {
  assert.equal(toImpactPacket(null), null);
  assert.equal(toImpactPacket({ ok: false, impacts: [] }), null);
  assert.equal(toImpactPacket({ ok: true }), null);
});

test('generated packets satisfy validation', () => {
  const packet = toImpactPacket(plan([], [item()]));
  assert.equal(validateImpactPacket(packet).ok, true);
});

test('packet validation rejects wrong version', () => {
  const packet = toImpactPacket(plan([], [item()]));
  assert.equal(validateImpactPacket({ ...packet, version: 2 }).ok, false);
});

test('packet validation rejects malformed impact entries', () => {
  const packet = toImpactPacket(plan([], [item()]));
  const modified = { ...packet, impacts: [null] };
  assert.ok(codes(validateImpactPacket(modified)).includes('IMPACT_SHAPE'));
});

test('packet validation rejects invented action', () => {
  const packet = toImpactPacket(plan([], [item()]));
  packet.impacts[0].action = 'AUTO_APPROVE';
  assert.ok(codes(validateImpactPacket(packet)).includes('ACTION_INVALID'));
});

test('packet validation rejects invented physical-world state', () => {
  const packet = toImpactPacket(plan([], [item()]));
  packet.impacts[0].state = 'probably';
  assert.ok(codes(validateImpactPacket(packet)).includes('STATE_INVALID'));
});

test('packet validation rejects unsupported reason', () => {
  const packet = toImpactPacket(plan([], [item()]));
  packet.impacts[0].reason = 'SYSTEM_CONFIRMED';
  assert.ok(codes(validateImpactPacket(packet)).includes('REASON_INVALID'));
});

test('packet validation requires level matched to reason', () => {
  const packet = toImpactPacket(plan([], [item()]));
  packet.impacts[0].level = 'block';
  assert.ok(codes(validateImpactPacket(packet)).includes('LEVEL_INVALID'));
});

test('packet rejects duplicate impact keys', () => {
  const packet = toImpactPacket(plan([], [item()]));
  packet.impacts.push({ ...packet.impacts[0] });
  assert.ok(codes(validateImpactPacket(packet)).includes('IMPACT_DUPLICATE'));
});

test('packet rejects extra top-level data', () => {
  const packet = toImpactPacket(plan([], [item()]));
  packet.email = 'private@example.org';
  assert.ok(codes(validateImpactPacket(packet)).includes('PACKET_EXTRA_KEY'));
});

test('packet rejects empty id and malformed record identifiers', () => {
  const packet = toImpactPacket(plan([], [item()]));
  packet.impacts[0].recordId = '';
  assert.ok(codes(validateImpactPacket(packet)).includes('IDENTITY_INVALID'));
});

test('packet rejects non-pointer paths', () => {
  const packet = toImpactPacket(plan([], [item()]));
  packet.impacts[0].path = 'unqualified';
  assert.ok(codes(validateImpactPacket(packet)).includes('PATH_INVALID'));
});

test('impact summary uses uppercase UNKNOWN for unknown records', () => {
  const result = plan([], [item()]);
  const summary = summarizeImpact(result);
  assert.equal(summary.token, 'UNKNOWN');
  assert.equal(summary.nextAction, 'HUMAN_REVIEW_REQUIRED');
});

test('impact summary on no changes does not schedule an action', () => {
  const result = plan([item()], [item()]);
  assert.equal(summarizeImpact(result).nextAction, 'NO_REVIEW_CHANGES');
});

test('source withdrawal is explicitly marked as blocking in summary', () => {
  const result = planSourceWithdrawal(queue(item()), source);
  assert.equal(summarizeImpact(result).hasBlockingSourceLoss, true);
});

test('invalid plan has no summary', () => {
  assert.equal(summarizeImpact({ ok: false }), null);
});

test('compare helper does not modify either input', () => {
  const first = item();
  const second = withEvidence(first, { tier: 1 });
  const before = structuredClone(first);
  const after = structuredClone(second);
  compareEvidenceItem(first, second);
  assert.deepEqual(first, before);
  assert.deepEqual(second, after);
});

test('source changed and state changed are reported separately', () => {
  const first = item();
  const second = reviewed(withEvidence(first, { source: 'https://example.net/new' }), 'YES');
  assert.deepEqual(compareEvidenceItem(first, second).map((change) => change.reason),
    ['SOURCE_REPLACED', 'CLAIM_CHANGED']);
});

test('multiple changed provenance fields all survive the report', () => {
  const first = item();
  const second = withEvidence(first, { source: 'https://example.net/new', tier: 1,
    licence: 'CC-BY-4.0', sourceDate: '2026-11-18', retrievedOn: DAY });
  const result = plan([first], [second]);
  assert.equal(result.summary.totalImpacts, 5);
  assert.equal(result.summary.affectedItems, 1);
  assert.equal(result.summary.blocking, 1);
});

test('impact records include no name, address, or contact fields', () => {
  const generated = toImpactPacket(plan([], [item()]));
  const text = JSON.stringify(generated);
  for (const secret of ['phone', 'email', 'address', 'birthdate']) {
    assert.equal(text.includes(`"${secret}"`), false);
  }
});

test('summary counts multiple UNKNOWN items without changing them', () => {
  const result = plan([], [item('a'), item('b')]);
  assert.equal(result.summary.unknownClaims, 2);
  assert.equal(result.impacts.every((impact) => impact.state === 'UNKNOWN'), true);
});

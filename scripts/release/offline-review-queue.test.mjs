import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REVIEW_QUEUE_VERSION, REVIEW_STATES, REVIEW_REASONS, REVIEW_ACTIONS,
  plain, validDate, validId, safeUrl, privateKeyIssues,
  validTranslation, frenchSpacingIssues, validateQueue, newQueue,
  addReview, transitionReview, summarizeQueue, formatQueueReport,
  serializeQueue, parseQueue,
} from './offline-review-queue.mjs';

const TODAY = '2026-11-19';
const evidence = () => ({
  source: 'https://example.org/open-data/item',
  licence: 'CC0-1.0',
  retrievedOn: TODAY,
  tier: 0,
  sourceDate: '2026-10-31',
});
const fixture = (id = 'review-a') => ({
  id,
  recordId: 'synthetic-record',
  claimKey: 'stepFreeEntrance',
  reason: 'unknown-claim',
  status: 'pending',
  state: 'UNKNOWN',
  createdOn: TODAY,
  label: { en: 'Illustrative entrance', fr: 'Entrée fictive' },
  provenance: evidence(),
  history: [],
});
const queue = (...items) => ({ version: REVIEW_QUEUE_VERSION, items });
const codes = (value) => value.problems.map((problem) => problem.code);
const CHECK = { today: TODAY };

test('pure module defines bounded review vocabulary', () => {
  assert.equal(REVIEW_QUEUE_VERSION, 1);
  assert.equal(new Set(REVIEW_STATES).size, REVIEW_STATES.length);
  assert.equal(new Set(REVIEW_REASONS).size, REVIEW_REASONS.length);
  assert.equal(new Set(REVIEW_ACTIONS).size, REVIEW_ACTIONS.length);
  assert.ok(REVIEW_STATES.includes('needs-evidence'));
  assert.ok(REVIEW_REASONS.includes('source-withdrawn'));
});

test('queue begins empty with no external inputs', () => {
  assert.deepEqual(newQueue(), queue());
  assert.equal(validateQueue(newQueue(), CHECK).ok, true);
});

test('plain object checks reject class instances and arrays', () => {
  assert.equal(plain({}), true);
  assert.equal(plain(Object.create(null)), true);
  assert.equal(plain(null), false);
  assert.equal(plain([]), false);
  assert.equal(plain(new Date()), false);
});

test('calendar dates are exact, including leap days', () => {
  for (const value of ['2024-02-29', '2026-11-19', '2000-02-29']) {
    assert.equal(validDate(value), true, value);
  }
  for (const value of ['2025-02-29', '2026-02-30', '0000-01-01',
    '2026-13-01', '2026-4-01', 'tomorrow', '', undefined]) {
    assert.equal(validDate(value), false, String(value));
  }
});

test('identifiers reject unsafe fields and separators', () => {
  assert.equal(validId('id:one/two'), false);
  assert.equal(validId('id_one.two'), true);
  assert.equal(validId('__proto__'), false);
  assert.equal(validId('constructor'), false);
  assert.equal(validId('x'.repeat(129)), false);
  assert.equal(validId(''), false);
});

test('only safe, credential-free HTTPS sources are accepted', () => {
  assert.equal(safeUrl('https://example.org/open'), true);
  for (const value of ['http://example.org', 'javascript:alert(1)',
    'https://x:y@example.org', 'https://localhost/private',
    'https://127.0.0.1', 'https://[::1]/', 'file:///temp',
    'https://example.org/\n', '', 42]) {
    assert.equal(safeUrl(value), false, String(value));
  }
});

test('private traversal reports paths but never sensitive values', () => {
  const value = { items: [{ email: 'private-value', sub: { api_key: 'another-secret' } }] };
  const issues = privateKeyIssues(value);
  assert.equal(issues.length, 2);
  assert.deepEqual(issues.map((i) => i.path), ['/items/0/email', '/items/0/sub/api_key']);
  assert.equal(JSON.stringify(issues).includes('private-value'), false);
  assert.equal(JSON.stringify(issues).includes('another-secret'), false);
});

test('private traversal rejects cycles without recursion crash', () => {
  const value = { a: 1 };
  value.self = value;
  assert.ok(privateKeyIssues(value).some((entry) => entry.code === 'CYCLIC_DATA'));
});

test('translation requires both language keys', () => {
  assert.equal(validTranslation({ en: 'Example', fr: 'Exemple' }), true);
  assert.equal(validTranslation({ en: 'Example' }), false);
  assert.equal(validTranslation({ en: 'Example', fr: ' ' }), false);
  assert.equal(validTranslation({ en: 'Example', fr: 'Exemple', es: 'Ejemplo' }), false);
});

test('French punctuation uses NBSP before colon and narrow NBSP elsewhere', () => {
  assert.deepEqual(frenchSpacingIssues('Source\u00A0: oui\u202F!', '/fr'), []);
  assert.ok(frenchSpacingIssues('Source : oui !', '/fr').length === 2);
  assert.deepEqual(frenchSpacingIssues('«\u202Fexemple\u202F»', '/fr'), []);
  assert.equal(frenchSpacingIssues('«exemple»', '/fr').length, 2);
});

test('French punctuation enforces narrow space before semicolon and question mark', () => {
  assert.deepEqual(frenchSpacingIssues('Oui\u202F; pourquoi\u202F?', '/fr'), []);
  assert.equal(frenchSpacingIssues('Oui ; pourquoi ?', '/fr').length, 2);
  assert.ok(frenchSpacingIssues('Oui\u00A0?', '/fr').some((p) => p.code === 'FR_NARROW_NBSP'));
});

test('French punctuation rejects NBSP where narrow NBSP is mandatory', () => {
  for (const sample of ['Oui\u00A0!', 'Oui\u00A0;', 'Oui\u00A0?', '«\u00A0essai\u00A0»']) {
    assert.ok(frenchSpacingIssues(sample, '/fr').length > 0, sample);
  }
});

test('French apostrophe rule rejects straight lexical apostrophes', () => {
  assert.ok(frenchSpacingIssues("L'application", '/fr').some((p) => p.code === 'FR_APOSTROPHE'));
  assert.deepEqual(frenchSpacingIssues('L’application', '/fr'), []);
});

test('UNKNOWN remains a token in French formatted reports', () => {
  const text = formatQueueReport(queue(fixture()), 'fr', CHECK);
  assert.ok(text.includes('UNKNOWN'));
  assert.ok(!text.includes('Inconnu'));
});

test('accepts synthetic review with Unknown claim and complete provenance', () => {
  const result = validateQueue(queue(fixture()), CHECK);
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
});

test('does not interpret Yes and No as physical-world findings', () => {
  for (const state of ['YES', 'NO', 'UNKNOWN']) {
    assert.equal(validateQueue(queue({ ...fixture(), state }), CHECK).ok, true);
  }
  assert.ok(codes(validateQueue(queue({ ...fixture(), state: true }), CHECK)).includes('CLAIM_INVALID'));
});

test('source licence date and tier are mandatory on each item', () => {
  const broken = fixture();
  broken.provenance = {};
  const errors = codes(validateQueue(queue(broken), CHECK));
  for (const key of ['SOURCE_REQUIRED', 'OPEN_LICENCE_REQUIRED',
    'RETRIEVAL_DATE_REQUIRED', 'TIER_REQUIRED']) {
    assert.ok(errors.includes(key), key);
  }
});

test('unsupported licence is never guessed to be open', () => {
  const bad = { ...fixture(), provenance: { ...evidence(), licence: 'open' } };
  assert.ok(codes(validateQueue(queue(bad), CHECK)).includes('OPEN_LICENCE_REQUIRED'));
});

test('unknown tier stays an error rather than evidence of trust', () => {
  const bad = { ...fixture(), provenance: { ...evidence(), tier: 'UNKNOWN' } };
  assert.ok(codes(validateQueue(queue(bad), CHECK)).includes('TIER_REQUIRED'));
});

test('retrieval cannot be later than reference date', () => {
  const bad = { ...fixture(), provenance: { ...evidence(), retrievedOn: '2026-11-20' } };
  assert.ok(codes(validateQueue(queue(bad), CHECK)).includes('RETRIEVAL_DATE_REQUIRED'));
});

test('source date cannot be later than retrieval date', () => {
  const bad = { ...fixture(), provenance: { ...evidence(), sourceDate: '2026-12-01' } };
  assert.ok(codes(validateQueue(queue(bad), CHECK)).includes('SOURCE_AFTER_RETRIEVAL'));
});

test('record identifiers remain unique and stable', () => {
  const result = validateQueue(queue(fixture(), fixture()), CHECK);
  assert.ok(codes(result).includes('DUPLICATE_ID'));
});

test('record labels reject broken French spacing', () => {
  const bad = { ...fixture(), label: { en: 'Entrance', fr: 'Entrée : test' } };
  assert.ok(codes(validateQueue(queue(bad), CHECK)).includes('FR_NBSP'));
});

test('private fields cause queue failure without copying their contents', () => {
  const bad = { ...fixture(), token: 'private-token-value' };
  const result = validateQueue(queue(bad), CHECK);
  assert.ok(codes(result).includes('PRIVATE_FIELD'));
  assert.ok(!JSON.stringify(result).includes('private-token-value'));
});

test('extra top-level keys are rejected', () => {
  assert.ok(codes(validateQueue({ ...queue(), extra: 'text' }, CHECK)).includes('QUEUE_EXTRA_FIELD'));
});

test('invalid data refuses creating a partially updated queue', () => {
  const original = queue(fixture());
  const result = addReview(original, { ...fixture('two'), provenance: null }, CHECK);
  assert.equal(result.ok, false);
  assert.equal(result.queue, original);
  assert.equal(original.items.length, 1);
});

test('adding an item does not mutate caller data', () => {
  const original = newQueue();
  const input = fixture();
  const result = addReview(original, input, CHECK);
  assert.equal(result.ok, true);
  assert.equal(original.items.length, 0);
  assert.equal(result.queue.items.length, 1);
  assert.notEqual(result.queue.items[0], input);
  input.label.en = 'Changed after insertion';
  assert.equal(result.queue.items[0].label.en, 'Illustrative entrance');
});

test('the queue refuses duplicate item insertion', () => {
  const original = queue(fixture());
  const result = addReview(original, fixture(), CHECK);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('DUPLICATE_ID'));
});

test('all allowed transitions are explicit', () => {
  const table = [
    ['pending', 'request-evidence', 'needs-evidence'],
    ['pending', 'record-evidence', 'ready-for-human-review'],
    ['pending', 'defer', 'deferred'],
    ['pending', 'close', 'closed'],
    ['needs-evidence', 'record-evidence', 'ready-for-human-review'],
    ['needs-evidence', 'defer', 'deferred'],
    ['ready-for-human-review', 'request-evidence', 'needs-evidence'],
    ['deferred', 'reopen', 'pending'],
    ['closed', 'reopen', 'pending'],
  ];
  for (const [from, action, to] of table) {
    const result = transitionReview(queue({ ...fixture(), status: from }), 'review-a', action, TODAY, CHECK);
    assert.equal(result.ok, true, `${from} + ${action}`);
    assert.equal(result.queue.items[0].status, to);
    assert.equal(result.queue.items[0].state, 'UNKNOWN');
  }
});

test('disallowed transition fails closed', () => {
  const original = queue(fixture());
  const result = transitionReview(original, 'review-a', 'reopen', TODAY, CHECK);
  assert.equal(result.ok, false);
  assert.equal(result.queue, original);
  assert.ok(codes(result).includes('ACTION_NOT_ALLOWED'));
});

test('review action never changes or promotes the feature state', () => {
  let current = queue(fixture());
  for (const action of ['request-evidence', 'record-evidence', 'close', 'reopen']) {
    const result = transitionReview(current, 'review-a', action, TODAY, CHECK);
    assert.equal(result.ok, true, action);
    current = result.queue;
    assert.equal(current.items[0].state, 'UNKNOWN');
    assert.equal(current.items[0].provenance.source, evidence().source);
  }
});

test('future transitions fail with no mutation', () => {
  const original = queue(fixture());
  const result = transitionReview(original, 'review-a', 'close', '2026-11-20', CHECK);
  assert.equal(result.ok, false);
  assert.equal(result.queue, original);
  assert.ok(codes(result).includes('FUTURE_EVENT'));
});

test('transition event cannot precede record creation', () => {
  const original = queue(fixture());
  const result = transitionReview(original, 'review-a', 'close', '2026-11-18', CHECK);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('EVENT_ORDER'));
});

test('transition to nonexistent item does not add a new record', () => {
  const original = queue(fixture());
  const result = transitionReview(original, 'unknown-id', 'close', TODAY, CHECK);
  assert.equal(result.ok, false);
  assert.equal(result.queue.items.length, 1);
  assert.ok(codes(result).includes('ITEM_NOT_FOUND'));
});

test('history order is validated during import', () => {
  const item = fixture();
  item.history = [{ action: 'close', to: 'closed', on: '2026-11-18' }];
  assert.ok(codes(validateQueue(queue(item), CHECK)).includes('EVENT_ORDER'));
});

test('summary counts state, reason and workflow separately', () => {
  const items = [fixture('a'), { ...fixture('b'), state: 'YES', status: 'closed', reason: 'changed-claim' }];
  const result = summarizeQueue(queue(...items), CHECK);
  assert.equal(result.ok, true);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.state.UNKNOWN, 1);
  assert.equal(result.summary.state.YES, 1);
  assert.equal(result.summary.status.closed, 1);
  assert.equal(result.summary.reason['changed-claim'], 1);
});

test('invalid queue has no summary to mistake for reviewed evidence', () => {
  const result = summarizeQueue(queue({ id: 'bad' }), CHECK);
  assert.equal(result.ok, false);
  assert.equal(result.summary, null);
});

test('English report is deterministic across input ordering', () => {
  const first = queue(fixture('b'), fixture('a'));
  const second = queue(fixture('a'), fixture('b'));
  assert.equal(formatQueueReport(first, 'en', CHECK), formatQueueReport(second, 'en', CHECK));
  assert.ok(formatQueueReport(first, 'en', CHECK).includes('not a claim'));
});

test('French report uses nonbreaking spaces at metadata colons', () => {
  const result = formatQueueReport(queue(fixture()), 'fr', CHECK);
  assert.ok(result.includes('Source\u00A0:'));
  assert.ok(result.includes('Licence\u00A0:'));
  assert.ok(result.includes('Consulté\u00A0:'));
  assert.ok(result.includes('Niveau de la source\u00A0:'));
  assert.ok(result.includes('accessibilité réelle'));
});

test('malformed input report exposes codes and not private values', () => {
  const item = { ...fixture(), password: 'not-for-output' };
  const output = formatQueueReport(queue(item), 'fr', CHECK);
  assert.ok(output.includes('PRIVATE_FIELD'));
  assert.ok(!output.includes('not-for-output'));
});

test('serialisation is stable across order and preserves evidence', () => {
  const first = serializeQueue(queue(fixture('b'), fixture('a')), CHECK);
  const second = serializeQueue(queue(fixture('a'), fixture('b')), CHECK);
  assert.equal(first.ok, true);
  assert.equal(first.text, second.text);
  assert.equal(JSON.parse(first.text).items[0].id, 'a');
});

test('round trip does not mutate Unknown state or source fields', () => {
  const original = queue(fixture());
  const serialized = serializeQueue(original, CHECK);
  const parsed = parseQueue(serialized.text, CHECK);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.queue.items[0].state, 'UNKNOWN');
  assert.deepEqual(parsed.queue.items[0].provenance, evidence());
});

test('malformed, oversized and sensitive JSON are rejected safely', () => {
  assert.ok(codes(parseQueue('{')).includes('INVALID_JSON'));
  assert.ok(codes(parseQueue('x'.repeat(8_000_001))).includes('INPUT_LIMIT'));
  assert.ok(codes(parseQueue(JSON.stringify(queue({ ...fixture(), email: 'private' })))).includes('PRIVATE_FIELD'));
});

test('source contains no literal nonbreaking spaces', async () => {
  const { readFile } = await import('node:fs/promises');
  const code = await readFile(new URL('./offline-review-queue.mjs', import.meta.url), 'utf8');
  assert.ok(!code.includes(String.fromCodePoint(160)));
  assert.ok(!code.includes(String.fromCodePoint(8239)));
});

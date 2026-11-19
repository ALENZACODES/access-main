import assert from 'node:assert/strict';
import { test } from 'node:test';
import { object, text, identifier, dayOrdinal, sourceUrl, offlinePath,
  finding, sorted, copyIssues, evidenceIssues, controlIssues, journeyIssues,
  eligibleControls, focusSequence, uniqueIssueCodes, issueSummary,
  LOCALES, STATES, TIERS, ACTIONS } from './contracts.mjs';
import { bilingual, clone, control, controls, journey, source } from './fixtures.node.mjs';
const codes = (issues) => issues.map((issue) => issue.code);
const has = (issues, code) => assert.ok(codes(issues).includes(code), `Expected ${code}: ${JSON.stringify(issues)}`);
test('language vocabulary is bilingual', () => assert.deepEqual(LOCALES, ['en', 'fr']));
test('status vocabulary retains UNKNOWN', () => assert.deepEqual(STATES, ['READY', 'HOLD', 'UNKNOWN']));
test('evidence tier vocabulary retains UNKNOWN', () => assert.ok(TIERS.includes('UNKNOWN')));
test('keyboard action vocabulary contains cancel', () => assert.ok(ACTIONS.includes('CANCEL')));
for (const value of [{}, { x: 1 }, Object.create(null)]) {
  test(`plain object accepted: ${Object.keys(value).length}`, () => assert.equal(object(value), true));
}
for (const [name, value] of [['null', null], ['array', []], ['string', 'string'], ['number', 1], ['boolean', false]]) {
  test(`non-plain ${name} rejected`, () => assert.equal(object(value), false));
}
for (const value of ['Hello', 'Bonjour', '«\u202FBonjour\u202F»', 'Entrée accessible', 'Action requise']) {
  test(`visible text accepted ${JSON.stringify(value)}`, () => assert.equal(text(value), true));
}
for (const value of ['', ' ', '\t', '\n', 'x\u0000y', 'bad\u007Ftext', 'x'.repeat(513)]) {
  test(`invalid text rejected ${JSON.stringify(value).slice(0, 30)}`, () => assert.equal(text(value), false));
}
for (const value of ['alpha', 'a-1', 'route-two', 'x', 'a0', 'entry-seven']) {
  test(`stable identifier accepted ${value}`, () => assert.equal(identifier(value), true));
}
for (const value of ['', '-', '1abc', 'ABC', 'alpha_beta', 'alpha space', 'a'.repeat(97), null, 7]) {
  test(`identifier rejected ${JSON.stringify(value)?.slice(0, 30)}`, () => assert.equal(identifier(value), false));
}
for (const [date, expected] of [['2024-02-29', true], ['2026-11-19', true], ['1970-01-01', true], ['2026-02-29', false], ['2026-04-31', false], ['2026-13-01', false], ['2026-00-15', false], ['2026-11-00', false], ['2026-1-1', false], ['not-a-date', false]]) {
  test(`calendar day ${date}`, () => assert.equal(dayOrdinal(date) !== null, expected));
}
test('consecutive days advance ordinal by one', () => assert.equal(dayOrdinal('2026-11-19') - dayOrdinal('2026-11-18'), 1));
test('leap day advances ordinal by one', () => assert.equal(dayOrdinal('2024-03-01') - dayOrdinal('2024-02-29'), 1));
for (const value of ['https://example.org/a', 'https://data.example.net/route.json', 'https://sub.example.org/path']) {
  test(`public source URL accepted ${value}`, () => assert.equal(sourceUrl(value), true));
}
for (const value of ['http://example.org', 'https://', 'https://u:p@example.org', 'https://example.org/#frag', 'javascript:alert(1)', '/local', 'https://localhost/path', 'https://127.0.0.1', 'https://example.org/a b', '', null]) {
  test(`unsafe source URL rejected ${String(value)}`, () => assert.equal(sourceUrl(value), false));
}
for (const value of ['/offline/a.json', '/offline/place/one.json', '/offline/route/one-v2.json']) {
  test(`offline path accepted ${value}`, () => assert.equal(offlinePath(value), true));
}
for (const value of ['http://example.org', '/outside/a', '/offline/../a', '/offline/a//b', '/offline/a%2fb', '/offline/a?x=1', '/offline/a#x', '/offline/a\\b', '', null]) {
  test(`unsafe offline path rejected ${String(value)}`, () => assert.equal(offlinePath(value), false));
}
test('diagnostic never copies raw record content', () => assert.deepEqual(finding('record.missing', 'record.title'), { code: 'record.missing', path: 'record.title', severity: 'error' }));
test('diagnostic can explicitly request review', () => assert.equal(finding('record.review', 'x', 'review').severity, 'review'));
test('sort orders by path then code', () => assert.deepEqual(sorted([finding('z', 'b'), finding('z', 'a'), finding('a', 'a')]).map((x) => x.code), ['a', 'z', 'z']));
test('bilingual labels pass', () => assert.deepEqual(copyIssues(bilingual(), 'label'), []));
for (const value of [null, [], 1, '', false]) {
  test(`invalid bilingual container ${String(value)}`, () => has(copyIssues(value, 'label'), 'copy.object'));
}
for (const lang of LOCALES) {
  test(`missing ${lang} label fails`, () => has(copyIssues({ ...bilingual(), [lang]: '' }, 'label'), 'copy.language'));
  test(`control characters in ${lang} label fail`, () => has(copyIssues({ ...bilingual(), [lang]: 'x\u0000y' }, 'label'), 'copy.language'));
}
test('French ASCII apostrophe is flagged', () => has(copyIssues(bilingual('Open', "L'ouverture"), 'label'), 'copy.french-apostrophe'));
test('French curly apostrophe passes', () => assert.deepEqual(copyIssues(bilingual('Open', 'L’ouverture'), 'label'), []));
test('French spaced colon with NBSP passes', () => assert.deepEqual(copyIssues(bilingual('Note', 'Note\u00A0: détail'), 'label'), []));
test('French plain spaced colon fails', () => has(copyIssues(bilingual('Note', 'Note : détail'), 'label'), 'copy.french-colon'));
for (const mark of [';', '!', '?']) {
  test(`French narrow no-break space before ${mark} passes`, () => assert.deepEqual(copyIssues(bilingual('Note', `Note\u202F${mark}`), 'label'), []));
  test(`French ordinary space before ${mark} fails`, () => has(copyIssues(bilingual('Note', `Note ${mark}`), 'label'), 'copy.french-narrow'));
}
test('French guillemets with narrow spaces pass', () => assert.deepEqual(copyIssues(bilingual('Welcome', '«\u202FBienvenue\u202F»'), 'label'), []));
test('French guillemet opening missing space fails', () => has(copyIssues(bilingual('Welcome', '«Bienvenue\u202F»'), 'label'), 'copy.guillemet-open'));
test('French guillemet closing missing space fails', () => has(copyIssues(bilingual('Welcome', '«\u202FBienvenue»'), 'label'), 'copy.guillemet-close'));
test('valid source has no finding', () => assert.deepEqual(evidenceIssues(source(), 'source', dayOrdinal('2026-11-19')), []));
for (const [field, value, code] of [['id', '', 'evidence.id'], ['publisher', '', 'evidence.publisher'], ['url', 'http://example.org', 'evidence.url'], ['licence', '', 'evidence.licence'], ['tier', 'invented', 'evidence.tier'], ['collectedOn', 'yesterday', 'evidence.date']]) {
  test(`source ${field} rejects ${String(value)}`, () => has(evidenceIssues(source({ [field]: value }), 'source', dayOrdinal('2026-11-19')), code));
}
test('source future collection date fails', () => has(evidenceIssues(source({ collectedOn: '2026-11-20' }), 'source', dayOrdinal('2026-11-19')), 'evidence.future'));
test('unknown source tier becomes review issue', () => has(evidenceIssues(source({ tier: 'UNKNOWN' }), 'source', dayOrdinal('2026-11-19')), 'evidence.unknown'));
test('missing source object fails', () => has(evidenceIssues(null, 'source', dayOrdinal('2026-11-19')), 'evidence.object'));
test('valid control has no findings', () => assert.deepEqual(controlIssues(control(), 'control'), []));
for (const [field, value, code] of [['id', '', 'control.id'], ['role', 'thing', 'control.unsupported-role'], ['enabled', null, 'control.enabled'], ['visible', null, 'control.visible'], ['tabIndex', 2, 'control.tabindex'], ['targetId', 'bad id', 'control.target'], ['group', 'bad id', 'control.group'], ['targetWidth', -1, 'control.width'], ['targetHeight', -1, 'control.height']]) {
  test(`control ${field} rejects ${String(value)}`, () => has(controlIssues(control({ [field]: value }), 'control'), code));
}
for (const role of ['button', 'link', 'checkbox', 'switch', 'radio', 'textbox', 'option', 'menuitem', 'tab']) {
  test(`control role ${role} supported`, () => assert.equal(codes(controlIssues(control({ role }), 'control')).includes('control.unsupported-role'), false));
}
test('focusable hidden control detected', () => has(controlIssues(control({ visible: false }), 'control'), 'control.hidden-focusable'));
test('disabled control in sequential tab order detected', () => has(controlIssues(control({ enabled: false }), 'control'), 'control.disabled-tabstop'));
test('small target receives review diagnostic', () => has(controlIssues(control({ targetWidth: 20, targetHeight: 20 }), 'control'), 'control.small-target'));
test('good journey has no structural findings', () => assert.deepEqual(journeyIssues(journey()), []));
test('non-object journey fails closed', () => has(journeyIssues(null), 'journey.object'));
test('duplicate IDs fail', () => has(journeyIssues(journey({ controls: [control(), control()] })), 'journey.duplicate-id'));
test('missing target reference fails', () => has(journeyIssues(journey({ controls: [control({ targetId: 'missing' })] })), 'journey.missing-target'));
test('missing label reference fails', () => has(journeyIssues(journey({ controls: [control({ labelledBy: ['missing'] })] })), 'journey.missing-reference'));
test('untrusted cache path fails', () => has(journeyIssues(journey({ cache: { state: 'PRESENT', path: '/wrong/a' } })), 'journey.cache-path'));
test('unknown tier cannot be upgraded', () => has(journeyIssues(journey({ evidence: source({ tier: 'UNKNOWN' }) })), 'journey.unknown-upgraded'));
test('unknown cache cannot be upgraded', () => has(journeyIssues(journey({ cache: { state: 'UNKNOWN' } })), 'journey.cache-unknown-upgraded'));
test('unknown remains a supported state', () => assert.ok(!codes(journeyIssues(journey({ state: 'UNKNOWN' }))).includes('journey.state')));
test('oversized control collection fails closed', () => has(journeyIssues(journey({ controls: Array(501).fill(control()) })), 'journey.controls'));
test('eligible control enumeration excludes hidden controls', () => assert.equal(eligibleControls([control(), control({ id: 'hidden', visible: false })]).length, 1));
test('eligible control enumeration excludes disabled controls', () => assert.equal(eligibleControls([control(), control({ id: 'disabled', enabled: false })]).length, 1));
test('focus order preserves authored order', () => assert.deepEqual(focusSequence(controls()), ['first', 'second', 'third']));
test('unique codes sorted and deduplicated', () => assert.deepEqual(uniqueIssueCodes([finding('b', 'x'), finding('a', 'y'), finding('b', 'z')]), ['a', 'b']));
test('issue summary reports error and review counts', () => assert.deepEqual(issueSummary([finding('a', 'x'), finding('b', 'y', 'review')]), { error: 1, review: 1, codes: ['a', 'b'] }));
test('journey assessment does not alter input', () => { const data = journey(); const before = clone(data); journeyIssues(data); assert.deepEqual(data, before); });

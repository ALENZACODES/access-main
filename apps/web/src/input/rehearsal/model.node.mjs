import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACTIONS, DEFAULT_OPTIONS, FACTS, KINDS, STATUSES, TIERS, assessJourney,
  checkFrenchPunctuation, decisionForStep, hasControl, isCopy, isObject, issue,
  journeyIssues, offlineIssues, ordinal, safeOfflinePath, safeSourceUrl,
  sortFindings, sourceIssues, stepIssues, textIssues, validDay, validId,
  validText,
} from './model.ts';

const TODAY = '2026-11-19';
const copy = (en = 'Entrance', fr = 'Entrée') => ({ en, fr });
const source = (changes = {}) => ({ name: 'Open dataset', url: 'https://example.org/access', licence: 'CC BY 4.0', collectedOn: '2026-11-18', tier: 'PRIMARY', ...changes });
const offline = (changes = {}) => ({ state: 'stored', path: '/offline/places/one.json', savedOn: TODAY, ...changes });
const step = (changes = {}) => ({ id: 'entrance-one', kind: 'entrance', label: copy(), detail: copy('Step-free door', 'Porte sans marches'),
  access: 'supported', source: source(), offline: offline(), sequence: 0, needsReview: false, ...changes });
const journey = (changes = {}) => ({ id: 'local-journey', name: copy('My journey', 'Mon trajet'), createdOn: TODAY, steps: [step()], ...changes });
const codes = arr => arr.map(f => f.code);
const has = (arr, code) => assert.ok(codes(arr).includes(code), `${code} absent: ${JSON.stringify(arr)}`);

test('statuses explicitly contain uncertainty', () => assert.deepEqual(STATUSES, ['READY','HOLD','UNKNOWN']));
test('types include custom journey steps', () => assert.ok(KINDS.includes('custom')));
test('source tiers preserve uncertainty', () => assert.ok(TIERS.includes('UNKNOWN')));
test('access vocabulary includes unknown', () => assert.ok(FACTS.includes('unknown')));
test('input commands include previous', () => assert.ok(ACTIONS.includes('PREVIOUS')));
test('defaults require no offline copy', () => assert.equal(DEFAULT_OPTIONS.requireOffline, false));
test('defaults bound source age', () => assert.equal(DEFAULT_OPTIONS.maxAgeDays, 180));
test('default policy is immutable', () => assert.equal(Object.isFrozen(DEFAULT_OPTIONS), true));

for (const [label, input, expected] of [
  ['ordinary object', {}, true],
  ['null object', Object.create(null), true],
  ['object with fields', { en: 'a' }, true],
  ['empty array', [], false],
  ['nonempty array', [1], false],
  ['null', null, false],
  ['undefined', undefined, false],
  ['number', 12, false],
  ['text', 'data', false],
  ['boolean', true, false],
]) {
  test(`plain-object contract: ${label}`, () => assert.equal(isObject(input), expected));
}
for (const [label, id, expected] of [
  ['simple identifier', 'a', true],
  ['hyphenated identifier', 'journey-one', true],
  ['numeric suffix', 'stop-42', true],
  ['uppercase', 'Stop-One', false],
  ['leading digit', '1stop', false],
  ['space', 'stop one', false],
  ['underscore', 'stop_one', false],
  ['double hyphen', 'stop--one', false],
  ['trailing hyphen', 'stop-', false],
  ['dot', 'stop.one', false],
  ['slash', 'stop/one', false],
  ['empty', '', false],
  ['non-string', 42, false],
  ['too long', `a${'b'.repeat(81)}`, false],
]) {
  test(`identifier validation: ${label}`, () => assert.equal(validId(id), expected));
}
for (const [label, text, expected] of [
  ['ordinary English', 'Accessible entrance', true],
  ['ordinary French', 'Entrée adaptée', true],
  ['trailing spaces', 'Accessible entrance ', true],
  ['empty text', '', false],
  ['whitespace only', '  ', false],
  ['undefined', undefined, false],
  ['numeric data', 10, false],
  ['null', null, false],
  ['text too long', 'x'.repeat(601), false],
  ['line break', 'text\ntext', false],
  ['tab', 'text\ttext', false],
  ['return', 'text\rtext', false],
  ['ASCII null', 'a\u0000b', false],
  ['delete', 'a\u007fb', false],
]) {
  test(`text validation: ${label}`, () => assert.equal(validText(text), expected));
}
test('zero-length copy rejected at custom limit', () => assert.equal(validText('', 0), false));
test('text exactly at custom limit passes', () => assert.equal(validText('AB', 2), true));
test('one over custom limit fails', () => assert.equal(validText('ABC', 2), false));
test('ASCII controls detected without control regex', () => assert.equal(hasControl('a\u0001b'), true));
test('clean Unicode is not treated as control', () => assert.equal(hasControl('École'), false));
test('narrow no-break space is accepted in copy', () => assert.equal(hasControl('Mot\u202F!'), false));
test('nonbreaking space is accepted in copy', () => assert.equal(hasControl('Titre\u00A0: contenu'), false));

for (const [label, date, expected] of [
  ['normal date', TODAY, true],
  ['leap date', '2024-02-29', true],
  ['nonleap February', '2026-02-29', false],
  ['invalid month', '2026-13-01', false],
  ['zero month', '2026-00-01', false],
  ['zero day', '2026-01-00', false],
  ['April overflow', '2026-04-31', false],
  ['empty', '', false],
  ['short month', '2026-1-19', false],
  ['year below bound', '1969-12-31', false],
  ['year over bound', '10000-01-01', false],
  ['not a date', 'tomorrow', false],
  ['null', null, false],
]) {
  test(`calendar boundary: ${label}`, () => assert.equal(validDay(date), expected));
}
test('date ordinals are one day apart', () => assert.equal(ordinal(TODAY) - ordinal('2026-11-18'), 1));
test('invalid ordinal is null', () => assert.equal(ordinal('2026-02-29'), null));
test('date ordinal is independent of local timezone', () => assert.equal(ordinal('1970-01-01'), 0));
for (const url of [
  'http://example.org/path',
  'https://user:pass@example.org/path',
  'https://example.org/path#fragment',
  'https://localhost/a',
  'https://127.0.0.1/a',
  'https://example.local/a',
  'javascript:alert(1)',
  'https://example.org/a b',
  'https://example.org/a\n',
  '/relative',
  '',
  'ftp://example.org',
]) {
  test(`source URL rejects unsafe input ${JSON.stringify(url)}`, () => assert.equal(safeSourceUrl(url), false));
}
test('source URL permits HTTPS public hostname', () => assert.equal(safeSourceUrl('https://example.org/places'), true));
test('source URL allows long query when bounded', () => assert.equal(safeSourceUrl('https://example.org/a?lang=fr'), true));
test('source URL rejects overly long values', () => assert.equal(safeSourceUrl(`https://example.org/${'a'.repeat(2100)}`), false));
for (const path of [
  '/offline',
  '/offline/',
  '/offline/a/../b.json',
  '/offline/a/%2e%2e/b.json',
  '//offline/a',
  '/offline/a?x=1',
  '/offline/a#fragment',
  '/offline/a\\b',
  '/data/cache.json',
  'offline/a.json',
  '/offline/a//b',
  '/offline/a\u0000b',
]) {
  test(`offline path rejects ${JSON.stringify(path)}`, () => assert.equal(safeOfflinePath(path), false));
}
test('offline path accepts a local JSON file', () => assert.equal(safeOfflinePath('/offline/places/entrance.json'), true));
test('offline path accepts a local dashed name', () => assert.equal(safeOfflinePath('/offline/places/stop-11.json'), true));

test('bilingual copy includes both languages', () => assert.equal(isCopy(copy()), true));
test('missing French copy is not complete', () => assert.equal(isCopy({ en: 'Door' }), false));
test('missing English copy is not complete', () => assert.equal(isCopy({ fr: 'Porte' }), false));
test('null is not bilingual copy', () => assert.equal(isCopy(null), false));
test('French copy checks valid text', () => assert.deepEqual(textIssues(copy(), 'copy'), []));
test('a missing bilingual object yields an issue', () => has(textIssues(null, 'copy'), 'copy.object'));
test('French missing key is an issue', () => has(textIssues({ en: 'Door' }, 'copy'), 'copy.fr'));
test('English missing key is an issue', () => has(textIssues({ fr: 'Porte' }, 'copy'), 'copy.en'));
test('English text is not prescribed as translated French', () => assert.deepEqual(textIssues(copy('Door','Door'), 'copy'), []));
for (const [label, input, expected] of [
  ['apostrophe', "l'ascenseur", 'fr.apostrophe'],
  ['colon', 'Note: bonjour', 'fr.colon'],
  ['semicolon', 'Étape; suivante', 'fr.narrow'],
  ['question', 'Où?', 'fr.narrow'],
  ['exclamation', 'Attention!', 'fr.narrow'],
  ['open guillemet', '«Texte\u202F»', 'fr.guillemet-open'],
  ['close guillemet', '«\u202FTexte»', 'fr.guillemet-close'],
]) {
  test(`French punctuation ${label} produces ${expected}`, () => has(checkFrenchPunctuation(input).map(code => issue(code, 'fr')), expected));
}
test('French curly apostrophe passes', () => assert.deepEqual(checkFrenchPunctuation('l’ascenseur'), []));
test('French colon with correct space passes', () => assert.deepEqual(checkFrenchPunctuation('Note\u00A0: bonjour'), []));
test('French narrow punctuation passes', () => assert.deepEqual(checkFrenchPunctuation('Attention\u202F!'), []));
test('French guillemet spaces pass', () => assert.deepEqual(checkFrenchPunctuation('«\u202FBonjour\u202F»'), []));
test('French punctuation issues are unique', () => assert.deepEqual(checkFrenchPunctuation('A! B!'), ['fr.narrow']));

test('valid source has no issues', () => assert.deepEqual(sourceIssues(source(), 'source', TODAY), []));
test('source is optional and missing is a review', () => assert.equal(sourceIssues(null, 'source', TODAY)[0].severity, 'review'));
test('missing source name is found', () => has(sourceIssues(source({ name: '' }), 'source', TODAY), 'source.name'));
test('non-HTTPS source is found', () => has(sourceIssues(source({ url: 'http://example.org' }), 'source', TODAY), 'source.url'));
test('missing source licence is found', () => has(sourceIssues(source({ licence: '' }), 'source', TODAY), 'source.licence'));
test('invalid source tier is found', () => has(sourceIssues(source({ tier: 'INVALID' }), 'source', TODAY), 'source.tier'));
test('unknown source tier is a review issue', () => assert.equal(sourceIssues(source({ tier: 'UNKNOWN' }), 'source', TODAY)[0].severity, 'review'));
test('invalid source date is found', () => has(sourceIssues(source({ collectedOn: '2026-11-31' }), 'source', TODAY), 'source.collected'));
test('future source date is found', () => has(sourceIssues(source({ collectedOn: '2026-11-20' }), 'source', TODAY), 'source.future'));
test('source on assessment date is allowed', () => assert.deepEqual(sourceIssues(source({ collectedOn: TODAY }), 'source', TODAY), []));

test('stored offline copy accepts safe metadata', () => assert.deepEqual(offlineIssues(offline(), 'offline', TODAY), []));
test('absent offline copy needs no path', () => assert.deepEqual(offlineIssues({ state: 'absent' }, 'offline', TODAY), []));
test('unknown offline copy remains explicit', () => assert.deepEqual(offlineIssues({ state: 'unknown' }, 'offline', TODAY), []));
test('missing offline object is invalid', () => has(offlineIssues(null, 'offline', TODAY), 'offline.object'));
test('offline state cannot be arbitrary', () => has(offlineIssues({ state: 'maybe' }, 'offline', TODAY), 'offline.state'));
test('stored copy needs a path', () => has(offlineIssues(offline({ path: '' }), 'offline', TODAY), 'offline.path'));
test('stored copy needs a date', () => has(offlineIssues(offline({ savedOn: null }), 'offline', TODAY), 'offline.date'));
test('stored copy cannot date future', () => has(offlineIssues(offline({ savedOn: '2026-11-20' }), 'offline', TODAY), 'offline.future'));
test('absent copy cannot claim a path', () => has(offlineIssues({ state: 'absent', path: '/offline/a' }, 'offline', TODAY), 'offline.unexpected-metadata'));
test('unknown copy cannot claim saved date', () => has(offlineIssues({ state: 'unknown', savedOn: TODAY }, 'offline', TODAY), 'offline.unexpected-metadata'));

test('complete step has no contract errors', () => assert.deepEqual(stepIssues(step(), 'step', DEFAULT_OPTIONS), []));
test('invalid step object is found', () => has(stepIssues(null, 'step', DEFAULT_OPTIONS), 'step.object'));
test('invalid step id is found', () => has(stepIssues(step({ id: 'x x' }), 'step', DEFAULT_OPTIONS), 'step.id'));
test('invalid step kind is found', () => has(stepIssues(step({ kind: 'teleport' }), 'step', DEFAULT_OPTIONS), 'step.kind'));
test('missing step label is found', () => has(stepIssues(step({ label: null }), 'step', DEFAULT_OPTIONS), 'copy.object'));
test('missing step detail is found', () => has(stepIssues(step({ detail: { en: 'Only' } }), 'step', DEFAULT_OPTIONS), 'copy.fr'));
test('invalid access state is found', () => has(stepIssues(step({ access: 'maybe' }), 'step', DEFAULT_OPTIONS), 'step.access'));
test('negative sequence is found', () => has(stepIssues(step({ sequence: -1 }), 'step', DEFAULT_OPTIONS), 'step.sequence'));
test('fractional sequence is found', () => has(stepIssues(step({ sequence: 1.5 }), 'step', DEFAULT_OPTIONS), 'step.sequence'));
test('review flag must be boolean', () => has(stepIssues(step({ needsReview: 'no' }), 'step', DEFAULT_OPTIONS), 'step.review'));

test('complete journey has no issues', () => assert.deepEqual(journeyIssues(journey()), []));
test('missing journey object is found', () => has(journeyIssues(null), 'journey.object'));
test('invalid journey ID is found', () => has(journeyIssues(journey({ id: 'bad id' })), 'journey.id'));
test('missing journey name is found', () => has(journeyIssues(journey({ name: null })), 'copy.object'));
test('invalid creation date is found', () => has(journeyIssues(journey({ createdOn: 'invalid' })), 'journey.date'));
test('empty steps fail', () => has(journeyIssues(journey({ steps: [] })), 'journey.steps'));
test('non-array steps fail', () => has(journeyIssues(journey({ steps: {} })), 'journey.steps'));
test('over-limit steps fail', () => has(journeyIssues(journey({ steps: Array(41).fill(step()) })), 'journey.steps'));
test('duplicate step IDs are detected', () => has(journeyIssues(journey({ steps: [step(), step({ sequence: 1 })] })), 'step.duplicate-id'));
test('duplicate step order is detected', () => has(journeyIssues(journey({ steps: [step(), step({ id: 'second' })] })), 'step.duplicate-sequence'));
test('duplicate offline paths are detected', () => has(journeyIssues(journey({ steps: [step(), step({ id: 'second', sequence: 1 })] })), 'offline.duplicate-path'));
test('policy with invalid date is rejected', () => assert.throws(() => journeyIssues(journey(), { ...DEFAULT_OPTIONS, today: 'tomorrow' }), TypeError));
test('negative source age limit is rejected', () => assert.throws(() => journeyIssues(journey(), { ...DEFAULT_OPTIONS, maxAgeDays: -1 }), TypeError));
test('fractional source age limit is rejected', () => assert.throws(() => journeyIssues(journey(), { ...DEFAULT_OPTIONS, maxAgeDays: 0.5 }), TypeError));

test('supported fresh step can be ready', () => assert.equal(decisionForStep(step(), DEFAULT_OPTIONS).status, 'READY'));
test('unknown access stays unknown', () => assert.equal(decisionForStep(step({ access: 'unknown' }), DEFAULT_OPTIONS).status, 'UNKNOWN'));
test('limited access does not become ready', () => assert.equal(decisionForStep(step({ access: 'limited' }), DEFAULT_OPTIONS).status, 'HOLD'));
test('unsupported access is held', () => assert.equal(decisionForStep(step({ access: 'unsupported' }), DEFAULT_OPTIONS).status, 'HOLD'));
test('unknown source tier stays unknown', () => assert.equal(decisionForStep(step({ source: source({ tier: 'UNKNOWN' }) }), DEFAULT_OPTIONS).status, 'UNKNOWN'));
test('unknown offline state stays unknown', () => assert.equal(decisionForStep(step({ offline: { state: 'unknown' } }), DEFAULT_OPTIONS).status, 'UNKNOWN'));
test('review request blocks readiness', () => assert.equal(decisionForStep(step({ needsReview: true }), DEFAULT_OPTIONS).status, 'HOLD'));
test('offline-required policy blocks absent copy', () => assert.equal(decisionForStep(step({ offline: { state: 'absent' } }), { ...DEFAULT_OPTIONS, requireOffline: true }).status, 'HOLD'));
test('fresh source at boundary can be ready', () => assert.equal(decisionForStep(step(), { ...DEFAULT_OPTIONS, maxAgeDays: 1 }).status, 'READY'));
test('source over age boundary is held', () => assert.equal(decisionForStep(step(), { ...DEFAULT_OPTIONS, maxAgeDays: 0 }).status, 'HOLD'));
test('missing source yields unknown rather than made-up ready', () => assert.equal(decisionForStep(step({ source: null }), DEFAULT_OPTIONS).status, 'UNKNOWN'));
test('journey with all supported facts can be ready', () => assert.equal(assessJourney(journey()).status, 'READY'));
test('journey with unknown step stays unknown', () => assert.equal(assessJourney(journey({ steps: [step({ access: 'unknown' })] })).status, 'UNKNOWN'));
test('journey with limited step is held', () => assert.equal(assessJourney(journey({ steps: [step({ access: 'limited' })] })).status, 'HOLD'));
test('journey contract errors take precedence', () => assert.equal(assessJourney(journey({ id: '' })).status, 'HOLD'));
test('journey source findings are not rendered as raw descriptions', () => assert.equal(JSON.stringify(assessJourney(journey({ steps: [step({ label: copy('Private details', '') })] })).findings).includes('Private details'), false));
test('issue sorting is stable by path', () => assert.deepEqual(sortFindings([issue('z','b'), issue('a','a')]).map(x => x.path), ['a','b']));
test('assessment does not mutate steps', () => { const value = journey(); const snapshot = JSON.stringify(value); assessJourney(value); assert.equal(JSON.stringify(value), snapshot); });

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyIssues, evidenceIssues, journeyIssues, finding, issueSummary, dayOrdinal } from './contracts.mjs';
import { initialScan, stepScan, replayScan, auditFocusWalk, auditReverseWalk, auditSwitchSelection } from './switch.mjs';
import { announcementReceipt, auditAnnouncements, compareAnnouncementWindows, formatAnnouncementStatus } from './announcements.mjs';
import { inspection, diffInspections, exportInspectionCsv, exportInspectionJson, exportInspectionJsonl,
  releaseGate, coverage, regressionFindings, reviewQueue, reportSummary } from './report.mjs';
import { DAY, bilingual, clone, control, journey, announcement, announcements, focusWalk, observation, source, live } from './fixtures.node.mjs';
const codes = (list) => list.map((item) => item.code);
const has = (list, code) => assert.ok(codes(list).includes(code), `${code} absent`);
const valid = () => inspection(journey(), { actions: ['NEXT', 'SELECT'], focus: focusWalk(), announcements: announcements(), live: [live()] });
const uncertain = () => inspection(journey({ state: 'UNKNOWN' }), { actions: ['NEXT', 'SELECT'], focus: focusWalk() });
const invalid = () => inspection(journey({ controls: [control({ id: 'INVALID ID' })] }), { actions: ['SELECT'], focus: focusWalk() });

test('integration preserves known calendar day', () => assert.ok(dayOrdinal(DAY) !== null));
test('integration validates source metadata independently', () => assert.deepEqual(evidenceIssues(source(), 'source', dayOrdinal(DAY)), []));
test('integration validates bilingual label independently', () => assert.deepEqual(copyIssues(bilingual(), 'copy'), []));
test('integration validates journey independently', () => assert.deepEqual(journeyIssues(journey()), []));
test('integration validates forward focus independently', () => assert.deepEqual(auditFocusWalk(journey(), focusWalk()), []));
test('integration validates reverse focus independently', () => assert.deepEqual(auditReverseWalk(focusWalk(), [observation('second'), observation('first')]), []));
test('integration validates announced status independently', () => assert.equal(announcementReceipt(announcements()).decision, 'READY'));
test('integration validates no duplicate announcements', () => assert.deepEqual(auditAnnouncements(announcements()), []));
test('integration accepts an explicit switch selection', () => assert.deepEqual(auditSwitchSelection(journey(), replayScan(journey(), ['SELECT'])), []));
test('integration report is ready', () => assert.equal(valid().decision, 'READY'));
test('integration unknown route state stays unknown', () => assert.equal(uncertain().decision, 'UNKNOWN'));
test('integration invalid identifier holds report', () => assert.equal(invalid().decision, 'HOLD'));
test('integration valid report has no errors', () => assert.equal(valid().summary.error, 0));
test('integration invalid report has error findings', () => assert.ok(invalid().summary.error > 0));
test('integration unknown report has no invented ready finding', () => assert.equal(uncertain().decision === 'READY', false));
test('integration report includes chosen switch target', () => assert.equal(valid().scan.selected, 'second'));
test('integration scan history starts with NEXT', () => assert.equal(replayScan(journey(), ['NEXT', 'SELECT']).history[0].action, 'NEXT'));
test('integration scan history ends with SELECT', () => assert.equal(replayScan(journey(), ['NEXT', 'SELECT']).history.at(-1).action, 'SELECT'));
test('integration scan action count stays bounded', () => assert.equal(valid().scan.actions, 2));
test('integration announcement counts match source list', () => assert.equal(valid().announcements.polite, 2));
test('integration public report does not include English control names', () => assert.equal(JSON.stringify(valid()).includes('Open options'), false));
test('integration public report does not include French control names', () => assert.equal(JSON.stringify(valid()).includes('Ouvrir les options'), false));
test('integration report does not mutate journey', () => { const data = journey(); const prior = clone(data); inspection(data, { actions: ['SELECT'] }); assert.deepEqual(data, prior); });
test('integration report does not mutate focus history', () => { const data = focusWalk(); const prior = clone(data); inspection(journey(), { focus: data }); assert.deepEqual(data, prior); });
test('integration report does not mutate announcement history', () => { const data = announcements(); const prior = clone(data); inspection(journey(), { announcements: data }); assert.deepEqual(data, prior); });

const variants = [
  ['missing English title', { title: { fr: 'Parcours accessible' } }, 'copy.language'],
  ['missing French title', { title: { en: 'Accessible journey' } }, 'copy.language'],
  ['invalid journey ID', { id: 'bad id' }, 'journey.id'],
  ['missing controls', { controls: null }, 'journey.controls'],
  ['bad cache path', { cache: { state: 'PRESENT', path: '/remote/a.json' } }, 'journey.cache-path'],
  ['unknown upgraded', { state: 'READY', evidence: source({ tier: 'UNKNOWN' }) }, 'journey.unknown-upgraded'],
  ['unknown cache upgraded', { state: 'READY', cache: { state: 'UNKNOWN' } }, 'journey.cache-unknown-upgraded'],
  ['bad source URL', { evidence: source({ url: 'http://example.org' }) }, 'evidence.url'],
  ['future source date', { evidence: source({ collectedOn: '2026-11-20' }) }, 'evidence.future'],
  ['missing source publisher', { evidence: source({ publisher: '' }) }, 'evidence.publisher'],
  ['missing source licence', { evidence: source({ licence: '' }) }, 'evidence.licence'],
  ['unrecognized record state', { state: 'APPROVED' }, 'journey.state'],
];
for (const [name, change, code] of variants) {
  test(`integrated contract ${name} reports ${code}`, () => {
    const result = inspection(journey(change));
    has(result.issues, code);
    assert.equal(result.decision, 'HOLD');
  });
  test(`integrated ${name} diagnostics do not include source descriptions`, () => {
    const result = inspection(journey(change));
    assert.equal(JSON.stringify(result.issues).includes('Open options'), false);
    assert.equal(JSON.stringify(result.issues).includes('Open public data'), false);
  });
  test(`integrated ${name} can export safe JSON`, () => {
    const result = inspection(journey(change));
    const exported = JSON.parse(exportInspectionJson(result));
    assert.ok(exported.errors > 0);
    assert.ok(exported.issues.some((issue) => issue.code === code));
  });
}
const keyboardDefects = [
  ['hidden first stop', { visible: false }, 'walk.hidden'],
  ['obscured first stop', { occluded: true }, 'walk.occluded'],
  ['no focus outline', { indicator: false }, 'walk.no-indicator'],
  ['too small interactive target', { targetWidth: 20, targetHeight: 20 }, 'walk.small-target'],
];
for (const [name, change, code] of keyboardDefects) {
  test(`integrated keyboard ${name} reports ${code}`, () => {
    const observations = [observation('first', change), observation('second'), observation('third')];
    const result = inspection(journey(), { focus: observations });
    has(result.issues, code);
  });
  test(`integrated keyboard ${name} appears in CSV diagnostics`, () => {
    const observations = [observation('first', change), observation('second'), observation('third')];
    const csv = exportInspectionCsv(inspection(journey(), { focus: observations }));
    assert.ok(csv.includes(code));
  });
  test(`integrated keyboard ${name} remains nonmutating`, () => {
    const observations = [observation('first', change), observation('second'), observation('third')];
    const before = clone(observations);
    inspection(journey(), { focus: observations });
    assert.deepEqual(observations, before);
  });
}
const announcementDefects = [
  ['blank announcement ID', { id: '' }, 'announcement.id'],
  ['unsupported politeness', { politeness: 'unknown' }, 'announcement.politeness'],
  ['invalid sequence', { sequence: 0 }, 'announcement.sequence'],
  ['invalid calendar day', { day: 'yesterday' }, 'announcement.day'],
  ['future calendar day', { day: '2026-11-20' }, 'announcement.future'],
  ['missing bilingual content', { message: { en: 'Ready' } }, 'copy.language'],
  ['unknown evidence upgraded', { evidenceState: 'UNKNOWN', state: 'READY' }, 'announcement.unknown-upgraded'],
];
for (const [name, change, code] of announcementDefects) {
  test(`integrated announcement ${name} is diagnosed`, () => {
    const result = inspection(journey(), { announcements: [announcement(change)] });
    has(result.issues, code);
  });
  test(`integrated announcement ${name} blocks release`, () => {
    const result = inspection(journey(), { announcements: [announcement(change)] });
    assert.equal(releaseGate([result]).decision, 'HOLD');
  });
  test(`integrated announcement ${name} keeps diagnostics source-free`, () => {
    const result = inspection(journey(), { announcements: [announcement(change)] });
    assert.equal(JSON.stringify(result.issues).includes('Ready for input'), false);
  });
}
for (const count of [0, 1, 2, 3, 4, 5, 6]) {
  test(`sequential ${count}-step navigation remains deterministic`, () => {
    const actions = Array(count).fill('NEXT');
    const a = replayScan(journey(), actions);
    const b = replayScan(journey(), actions);
    assert.deepEqual(a, b);
  });
  test(`sequential ${count}-step navigation has expected history length`, () => {
    const actions = Array(count).fill('NEXT');
    assert.equal(replayScan(journey(), actions).history.length, count);
  });
  test(`sequential ${count}-step navigation is source-copy safe`, () => {
    const actions = Array(count).fill('NEXT');
    assert.equal(JSON.stringify(replayScan(journey(), actions)).includes('Open options'), false);
  });
}
test('combined release gate rejects a held inspection', () => assert.equal(releaseGate([valid(), invalid()]).decision, 'HOLD'));
test('combined release gate rejects a missing inspection', () => assert.equal(releaseGate([]).decision, 'UNKNOWN'));
test('combined release gate retains uncertainty', () => assert.equal(releaseGate([valid(), uncertain()]).decision, 'UNKNOWN'));
test('combined release gate accepts ready assessments', () => assert.equal(releaseGate([valid(), valid()]).decision, 'READY'));
test('combined review queue excludes clean checks', () => assert.deepEqual(reviewQueue([valid()]), []));
test('combined review queue includes uncertain checks', () => assert.equal(reviewQueue([uncertain()]).length, 1));
test('combined review queue includes invalid checks', () => assert.equal(reviewQueue([invalid()]).length, 1));
test('combined report summary remains source-safe', () => assert.equal(JSON.stringify(reportSummary(invalid())).includes('Open options'), false));
test('combined CSV report contains structural categories', () => assert.ok(exportInspectionCsv(invalid()).includes('"control"')));
test('combined JSONL export is parseable', () => assert.equal(JSON.parse(exportInspectionJsonl([valid()]).trim()).decision, 'READY'));
test('combined JSONL export does not leak label copy', () => assert.equal(exportInspectionJsonl([invalid()]).includes('Ouvrir les options'), false));
test('combined regression report identifies lost readiness', () => has(regressionFindings(valid(), invalid()), 'regression.readiness-lost'));
test('combined regression diff lists new defects', () => assert.ok(diffInspections(valid(), invalid()).introduced.length > 0));
test('combined evidence status text in French is explicit', () => assert.equal(formatAnnouncementStatus({ decision: 'UNKNOWN' }, 'fr'), 'État inconnu'));
test('combined evidence status text in English is explicit', () => assert.equal(formatAnnouncementStatus({ decision: 'UNKNOWN' }, 'en'), 'Status unknown'));
test('combined evidence review counts uncertainty', () => assert.equal(coverage([uncertain()]).UNKNOWN, 1));
test('combined evidence review counts structural failures', () => assert.equal(coverage([invalid()]).HOLD, 1));
test('combined evidence review counts clean runs', () => assert.equal(coverage([valid()]).READY, 1));
test('combined release reasons are deterministic', () => assert.deepEqual(releaseGate([uncertain()]), releaseGate([uncertain()])));
test('combined record issues use deterministic ordering', () => assert.deepEqual(journeyIssues(journey()), journeyIssues(journey())));
test('combined issue summary retains sorting', () => assert.deepEqual(issueSummary([finding('a', 'x')]).codes, ['a']));
test('combined announcement comparison can flag newly assertive alerts', () => {
  const before = [announcement()];
  const after = [announcement(), announcement({ id: 'urgent', sequence: 2, kind: 'alert', politeness: 'assertive', message: bilingual('Alert', 'Alerte') })];
  has(compareAnnouncementWindows(before, after), 'announcement.assertive-increased');
});
test('combined announcement comparison can flag lost readiness', () => {
  has(compareAnnouncementWindows(announcements(), [announcement({ id: '' })]), 'announcement.readiness-lost');
});
test('combined switch scan can cancel without selecting', () => assert.equal(stepScan(initialScan(journey()), 'CANCEL').selected, null));
test('combined switch scan can restart at first target', () => assert.equal(replayScan(journey(), ['NEXT', 'RESTART']).index, 0));
test('combined report can represent unknown without inventing evidence', () => assert.equal(inspection(journey({ state: 'UNKNOWN' })).decision, 'UNKNOWN'));

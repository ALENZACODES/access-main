import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POLITENESS, KINDS, announcementOptions, announcementIssues, auditAnnouncements,
  announcementReceipt, receiptForTarget, compareAnnouncementWindows, makeAnnouncement,
  formatAnnouncementStatus, auditLiveSnapshot } from './announcements.mjs';
import { announcement, announcements, bilingual, clone, live } from './fixtures.node.mjs';
const codes = (issues) => issues.map((issue) => issue.code);
const has = (issues, code) => assert.ok(codes(issues).includes(code), `${code} absent from ${JSON.stringify(issues)}`);
test('politeness options are finite', () => assert.deepEqual(POLITENESS, ['polite', 'assertive', 'off']));
test('announcement kinds include switch', () => assert.ok(KINDS.includes('switch')));
test('announcement kinds include offline', () => assert.ok(KINDS.includes('offline')));
test('announcement options have bounded default', () => assert.equal(announcementOptions().maxRecords, 1000));
test('announcement options prohibit repeats by default', () => assert.equal(announcementOptions().allowRepeats, false));
test('announcement options are immutable', () => assert.ok(Object.isFrozen(announcementOptions())));
test('announcement options support repeat policies', () => assert.equal(announcementOptions({ allowRepeats: true }).allowRepeats, true));
test('announcement options preserve selected day', () => assert.equal(announcementOptions({ asOf: '2026-11-18' }).asOf, '2026-11-18'));
for (const [field, value] of [['asOf', 'yesterday'], ['asOf', '2026-02-29'], ['maxRecords', 0], ['maxRecords', -1], ['maxRecords', 10001], ['maxRecords', 1.5], ['allowRepeats', 'yes']]) {
  test(`invalid option ${field} ${String(value)} fails`, () => assert.throws(() => announcementOptions({ [field]: value }), TypeError));
}
for (const value of [null, [], 1, 'x']) {
  test(`non-object options ${String(value)} fail`, () => assert.throws(() => announcementOptions(value), TypeError));
}
test('standard announcement has no issues', () => assert.deepEqual(announcementIssues(announcement(), 'entry'), []));
test('missing announcement object fails', () => has(announcementIssues(null, 'entry'), 'announcement.object'));
for (const [field, value, code] of [
  ['id', 'BAD ID', 'announcement.id'],
  ['kind', 'unknown-kind', 'announcement.kind'],
  ['politeness', 'loud', 'announcement.politeness'],
  ['atomic', 'yes', 'announcement.atomic'],
  ['sequence', 0, 'announcement.sequence'],
  ['sequence', 1.5, 'announcement.sequence'],
  ['targetId', 'bad reference', 'announcement.target'],
  ['day', 'yesterday', 'announcement.day'],
  ['day', '2026-11-20', 'announcement.future'],
  ['state', 'APPROVED', 'announcement.state'],
]) {
  test(`malformed ${field} produces ${code}`, () => {
    const findings = announcementIssues(announcement({ [field]: value }), 'entry');
    has(findings, code);
    assert.ok(findings.every((finding) => finding.path.startsWith('entry')));
  });
}
for (const kind of KINDS) {
  test(`valid announcement kind ${kind} accepted`, () => {
    const issues = announcementIssues(announcement({ kind }), 'entry');
    assert.equal(codes(issues).includes('announcement.kind'), false);
  });
}
for (const politeness of POLITENESS) {
  test(`politeness ${politeness} is recognized`, () => {
    const issues = announcementIssues(announcement({ politeness }), 'entry');
    assert.equal(codes(issues).includes('announcement.politeness'), false);
  });
}
test('alert should be assertive for urgent notification', () => has(announcementIssues(announcement({ kind: 'alert', politeness: 'polite' }), 'entry'), 'announcement.alert-politeness'));
test('status should not be silent', () => has(announcementIssues(announcement({ kind: 'status', politeness: 'off' }), 'entry'), 'announcement.silent-status'));
test('unknown evidence cannot produce ready state', () => has(announcementIssues(announcement({ state: 'READY', evidenceState: 'UNKNOWN' }), 'entry'), 'announcement.unknown-upgraded'));
test('private assertive announcements are rejected', () => has(announcementIssues(announcement({ sensitive: true, politeness: 'assertive' }), 'entry'), 'announcement.private-assertive'));
test('dismissed assertive announcements need review', () => has(announcementIssues(announcement({ dismissed: true, politeness: 'assertive' }), 'entry'), 'announcement.dismissed-alert'));
test('missing English text is detected', () => has(announcementIssues(announcement({ message: { fr: 'Bonjour' } }), 'entry'), 'copy.language'));
test('missing French text is detected', () => has(announcementIssues(announcement({ message: { en: 'Hello' } }), 'entry'), 'copy.language'));
test('French punctuation is checked', () => has(announcementIssues(announcement({ message: bilingual('Attention', 'Attention !') }), 'entry'), 'copy.french-narrow'));
test('French narrow punctuation passes', () => assert.deepEqual(announcementIssues(announcement({ message: bilingual('Attention', 'Attention\u202F!') }), 'entry'), []));
test('well-formed announcements are accepted', () => assert.deepEqual(auditAnnouncements(announcements()), []));
test('collection must be array', () => has(auditAnnouncements(null), 'announcements.array'));
test('collection max is applied', () => has(auditAnnouncements(Array(1001).fill(announcement())), 'announcements.array'));
test('duplicate IDs are rejected', () => has(auditAnnouncements([announcement(), announcement({ sequence: 2 })]), 'announcements.duplicate-id'));
test('nonmonotonic sequences are rejected', () => has(auditAnnouncements([announcement({ sequence: 2 }), announcement({ id: 'other', sequence: 1 })]), 'announcements.sequence-regressed'));
test('equal sequences are rejected', () => has(auditAnnouncements([announcement(), announcement({ id: 'other' })]), 'announcements.sequence-regressed'));
test('repeated message receives review', () => has(auditAnnouncements([announcement(), announcement({ id: 'other', sequence: 2 })]), 'announcements.repeated'));
test('repeat policy permits repeated messages', () => assert.equal(codes(auditAnnouncements([announcement(), announcement({ id: 'other', sequence: 2 })], { allowRepeats: true })).includes('announcements.repeated'), false));
test('out-of-order sequence does not echo text', () => { const issues = auditAnnouncements([announcement({ sequence: 2 }), announcement({ id: 'other', sequence: 1 })]); assert.equal(JSON.stringify(issues).includes('Ready for input'), false); });
test('collection audit does not mutate records', () => { const list = announcements(); const before = clone(list); auditAnnouncements(list); assert.deepEqual(list, before); });
test('good receipt is ready', () => assert.equal(announcementReceipt(announcements()).decision, 'READY'));
test('bad receipt is held', () => assert.equal(announcementReceipt([announcement({ id: '' })]).decision, 'HOLD'));
test('uncertain evidence stays unknown', () => assert.equal(announcementReceipt([announcement({ state: 'UNKNOWN' })]).decision, 'UNKNOWN'));
test('receipt counts polite status messages', () => assert.equal(announcementReceipt(announcements()).totals.polite, 2));
test('receipt counts assertive announcements', () => assert.equal(announcementReceipt([announcement({ kind: 'alert', politeness: 'assertive' })]).totals.assertive, 1));
test('receipt counts alerts', () => assert.equal(announcementReceipt([announcement({ kind: 'alert', politeness: 'assertive' })]).totals.alerts, 1));
test('receipt counts statuses', () => assert.equal(announcementReceipt(announcements()).totals.statuses, 2));
test('receipt detects unrecognized politeness', () => assert.equal(announcementReceipt([announcement({ politeness: 'noisy' })]).totals.unknown, 1));
test('receipt target filter matches first control', () => assert.equal(receiptForTarget(announcements(), 'first').length, 1));
test('receipt target filter matches second control', () => assert.equal(receiptForTarget(announcements(), 'second').length, 1));
test('receipt target filter rejects invalid ID', () => assert.deepEqual(receiptForTarget(announcements(), 'bad id'), []));
test('receipt target filter protects against malformed input', () => assert.deepEqual(receiptForTarget(null, 'first'), []));
test('receipt target filter does not echo source copy', () => assert.equal(JSON.stringify(receiptForTarget(announcements(), 'first')).includes('Ready for input'), false));
test('no window regression for equal collections', () => assert.deepEqual(compareAnnouncementWindows(announcements(), announcements()), []));
test('readiness loss appears in window comparison', () => has(compareAnnouncementWindows(announcements(), [announcement({ id: '' })]), 'announcement.readiness-lost'));
test('new assertive announcement emits review signal', () => has(compareAnnouncementWindows([announcement()], [announcement(), announcement({ id: 'alert-two', sequence: 2, kind: 'alert', politeness: 'assertive', message: bilingual('Alert', 'Alerte') })]), 'announcement.assertive-increased'));
test('new silent announcement emits review signal', () => has(compareAnnouncementWindows([announcement()], [announcement(), announcement({ id: 'silent-two', sequence: 2, politeness: 'off', message: bilingual('Silent', 'Silencieux') })]), 'announcement.silent-increased'));
test('new malformed item increases finding count', () => has(compareAnnouncementWindows([announcement()], [announcement(), announcement({ id: 'bad id', sequence: 2 })]), 'announcement.issues-increased'));
test('valid announcement creation fills day', () => assert.equal(makeAnnouncement(announcement(), 3).record.day, '2026-11-19'));
test('valid announcement creation sets event sequence', () => assert.equal(makeAnnouncement(announcement(), 3).record.sequence, 3));
test('invalid announcement creation returns no record', () => assert.equal(makeAnnouncement(announcement({ id: 'bad id' }), 1).record, null));
test('unknown default state is preserved', () => assert.equal(makeAnnouncement({ ...announcement(), state: undefined }, 1).record.state, 'UNKNOWN'));
test('invalid sequence is rejected on create', () => assert.throws(() => makeAnnouncement(announcement(), 0), TypeError));
test('non-object creation request rejected', () => assert.throws(() => makeAnnouncement(null, 1), TypeError));
test('English status for ready is clear', () => assert.equal(formatAnnouncementStatus({ decision: 'READY' }), 'Ready for local review'));
test('English status for hold is clear', () => assert.equal(formatAnnouncementStatus({ decision: 'HOLD' }), 'Needs attention'));
test('English status for unknown is explicit', () => assert.equal(formatAnnouncementStatus({ decision: 'UNKNOWN' }), 'Status unknown'));
test('French ready status uses curly apostrophe', () => assert.ok(formatAnnouncementStatus({ decision: 'READY' }, 'fr').includes('l’examen')));
test('French hold status uses literal local copy', () => assert.equal(formatAnnouncementStatus({ decision: 'HOLD' }, 'fr'), 'Action requise'));
test('French unknown status is explicit', () => assert.equal(formatAnnouncementStatus({ decision: 'UNKNOWN' }, 'fr'), 'État inconnu'));
test('unsupported locale fails closed', () => assert.throws(() => formatAnnouncementStatus({ decision: 'READY' }, 'de'), TypeError));
test('valid live-region snapshot has no issues', () => assert.deepEqual(auditLiveSnapshot([live()]), []));
test('live snapshot must be array', () => has(auditLiveSnapshot(null), 'live.array'));
test('live snapshot requires objects', () => has(auditLiveSnapshot([null]), 'live.object'));
test('duplicate live IDs detected', () => has(auditLiveSnapshot([live(), live()]), 'live.duplicate-id'));
for (const [field, value, code] of [
  ['id', 'bad id', 'live.id'],
  ['role', 'unsupported', 'live.role'],
  ['live', 'loud', 'live.politeness'],
  ['atomic', null, 'live.atomic'],
  ['content', '', 'live.content'],
]) {
  test(`live-region ${field} rejects invalid value`, () => has(auditLiveSnapshot([live({ [field]: value })]), code));
}
test('silent alert is detected', () => has(auditLiveSnapshot([live({ role: 'alert', live: 'off' })]), 'live.silent-alert'));
test('hidden assertive live region is detected', () => has(auditLiveSnapshot([live({ live: 'assertive', hidden: true })]), 'live.hidden-assertive'));
test('busy updates are reviewable', () => has(auditLiveSnapshot([live({ busy: true, messageChanged: true })]), 'live.busy-update'));
for (const role of ['status', 'alert', 'log', 'timer', 'progressbar']) {
  test(`native live-region role ${role} supported`, () => assert.equal(codes(auditLiveSnapshot([live({ role })])).includes('live.role'), false));
}
test('repeated live snapshots are deterministic', () => assert.deepEqual(auditLiveSnapshot([live()]), auditLiveSnapshot([live()])));
test('live diagnostics never disclose message content', () => { const issues = auditLiveSnapshot([live({ content: '' })]); assert.equal(JSON.stringify(issues).includes('Ready'), false); });

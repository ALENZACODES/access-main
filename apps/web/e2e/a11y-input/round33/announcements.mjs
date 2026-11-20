/** Live-region receipts are observations, not evidence that a claim is true. */
import { dayOrdinal, finding, identifier, object, sorted, text, copyIssues } from './contracts.mjs';
export const POLITENESS = Object.freeze(['polite', 'assertive', 'off']);
export const KINDS = Object.freeze(['status', 'alert', 'progress', 'dialog', 'offline', 'switch']);
export function announcementOptions(input = {}) {
  if (!object(input)) throw new TypeError('options must be object');
  const asOf = input.asOf ?? '2026-11-19';
  const today = dayOrdinal(asOf);
  if (today === null) throw new TypeError('asOf must be valid');
  const maxRecords = input.maxRecords ?? 1000;
  const allowRepeats = input.allowRepeats ?? false;
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 10000) throw new TypeError('invalid maxRecords');
  if (typeof allowRepeats !== 'boolean') throw new TypeError('invalid allowRepeats');
  return Object.freeze({ asOf, today, maxRecords, allowRepeats });
}
export function announcementIssues(record, path, options = {}) {
  const policy = announcementOptions(options);
  const out = [];
  if (!object(record)) return [finding('announcement.object', path)];
  if (!identifier(record.id)) out.push(finding('announcement.id', `${path}.id`));
  if (!KINDS.includes(record.kind)) out.push(finding('announcement.kind', `${path}.kind`));
  if (!POLITENESS.includes(record.politeness)) out.push(finding('announcement.politeness', `${path}.politeness`));
  if (typeof record.atomic !== 'boolean') out.push(finding('announcement.atomic', `${path}.atomic`));
  if (!Number.isSafeInteger(record.sequence) || record.sequence < 1) out.push(finding('announcement.sequence', `${path}.sequence`));
  if (record.targetId !== undefined && !identifier(record.targetId)) out.push(finding('announcement.target', `${path}.targetId`));
  out.push(...copyIssues(record.message, `${path}.message`));
  const date = dayOrdinal(record.day);
  if (date === null) out.push(finding('announcement.day', `${path}.day`));
  else if (date > policy.today) out.push(finding('announcement.future', `${path}.day`));
  if (record.kind === 'alert' && record.politeness !== 'assertive') out.push(finding('announcement.alert-politeness', path, 'review'));
  if (record.kind === 'status' && record.politeness === 'off') out.push(finding('announcement.silent-status', path, 'review'));
  if (record.state !== undefined && !['READY', 'HOLD', 'UNKNOWN'].includes(record.state)) out.push(finding('announcement.state', `${path}.state`));
  if (record.evidenceState === 'UNKNOWN' && record.state === 'READY') out.push(finding('announcement.unknown-upgraded', `${path}.state`));
  if (record.sensitive === true && record.politeness === 'assertive') out.push(finding('announcement.private-assertive', path));
  if (record.dismissed === true && record.politeness === 'assertive') out.push(finding('announcement.dismissed-alert', path, 'review'));
  return sorted(out);
}
export function auditAnnouncements(input, options = {}) {
  const policy = announcementOptions(options);
  if (!Array.isArray(input) || input.length > policy.maxRecords) return [finding('announcements.array', 'announcements')];
  const out = [];
  const byId = new Set();
  const seen = new Set();
  let previous = 0;
  for (let i = 0; i < input.length; i += 1) {
    const entry = input[i]; const at = `announcements[${i}]`;
    out.push(...announcementIssues(entry, at, policy));
    if (!object(entry)) continue;
    if (identifier(entry.id) && byId.has(entry.id)) out.push(finding('announcements.duplicate-id', `${at}.id`));
    byId.add(entry.id);
    if (Number.isSafeInteger(entry.sequence)) {
      if (entry.sequence <= previous) out.push(finding('announcements.sequence-regressed', `${at}.sequence`));
      previous = entry.sequence;
    }
    if (object(entry.message)) {
      const key = `${entry.kind}:${entry.targetId ?? ''}:${entry.message.en ?? ''}:${entry.message.fr ?? ''}`;
      if (seen.has(key) && !policy.allowRepeats) out.push(finding('announcements.repeated', at, 'review'));
      seen.add(key);
    }
  }
  return sorted(out);
}
export function announcementReceipt(input, options = {}) {
  const issues = auditAnnouncements(input, options);
  const records = Array.isArray(input) ? input : [];
  const totals = { polite: 0, assertive: 0, off: 0, unknown: 0, alerts: 0, statuses: 0 };
  for (const entry of records) {
    if (!object(entry)) continue;
    if (entry.politeness in totals) totals[entry.politeness] += 1;
    else totals.unknown += 1;
    if (entry.kind === 'alert') totals.alerts += 1;
    if (entry.kind === 'status') totals.statuses += 1;
  }
  return { decision: issues.some((x) => x.severity === 'error') ? 'HOLD' : records.some((x) => x?.state === 'UNKNOWN' || x?.evidenceState === 'UNKNOWN') ? 'UNKNOWN' : 'READY', totals, issues };
}
export function receiptForTarget(input, targetId) {
  if (!identifier(targetId) || !Array.isArray(input)) return [];
  return input.filter((item) => object(item) && item.targetId === targetId).map((entry) => ({ id: entry.id, sequence: entry.sequence, kind: entry.kind, state: entry.state ?? 'UNKNOWN' }));
}
export function compareAnnouncementWindows(before, after, options = {}) {
  const out = [];
  const a = announcementReceipt(before, options); const b = announcementReceipt(after, options);
  if (a.decision === 'READY' && b.decision !== 'READY') out.push(finding('announcement.readiness-lost', 'comparison'));
  if (b.totals.assertive > a.totals.assertive) out.push(finding('announcement.assertive-increased', 'comparison', 'review'));
  if (b.totals.off > a.totals.off) out.push(finding('announcement.silent-increased', 'comparison', 'review'));
  if (b.issues.length > a.issues.length) out.push(finding('announcement.issues-increased', 'comparison'));
  return sorted(out);
}
export function makeAnnouncement(input, sequence, options = {}) {
  const policy = announcementOptions(options);
  if (!object(input) || !Number.isSafeInteger(sequence) || sequence < 1) throw new TypeError('invalid announcement');
  const value = { id: input.id, kind: input.kind, politeness: input.politeness,
    atomic: input.atomic, sequence, targetId: input.targetId, message: input.message,
    state: input.state ?? 'UNKNOWN', evidenceState: input.evidenceState ?? 'UNKNOWN', day: policy.asOf };
  const issues = announcementIssues(value, 'announcement', policy);
  if (issues.some((entry) => entry.severity === 'error')) return { record: null, issues };
  return { record: value, issues };
}
export function formatAnnouncementStatus(receipt, locale = 'en') {
  if (!['en', 'fr'].includes(locale)) throw new TypeError('unsupported locale');
  const status = receipt?.decision === 'READY' ? 'READY' : receipt?.decision === 'HOLD' ? 'HOLD' : 'UNKNOWN';
  const dictionary = {
    en: { READY: 'Ready for local review', HOLD: 'Needs attention', UNKNOWN: 'Status unknown' },
    fr: { READY: 'Prêt pour l’examen local', HOLD: 'Action requise', UNKNOWN: 'État inconnu' },
  };
  return dictionary[locale][status];
}
export function auditLiveSnapshot(snapshot) {
  if (!Array.isArray(snapshot)) return [finding('live.array', 'live')];
  const out = [];
  const ids = new Set();
  for (let i = 0; i < snapshot.length; i += 1) {
    const item = snapshot[i]; const at = `live[${i}]`;
    if (!object(item)) { out.push(finding('live.object', at)); continue; }
    if (!identifier(item.id)) out.push(finding('live.id', `${at}.id`));
    else if (ids.has(item.id)) out.push(finding('live.duplicate-id', `${at}.id`));
    ids.add(item.id);
    if (!['status', 'alert', 'log', 'timer', 'progressbar'].includes(item.role)) out.push(finding('live.role', `${at}.role`));
    if (!POLITENESS.includes(item.live)) out.push(finding('live.politeness', `${at}.live`));
    if (item.role === 'alert' && item.live === 'off') out.push(finding('live.silent-alert', at));
    if (item.hidden === true && item.live === 'assertive') out.push(finding('live.hidden-assertive', at));
    if (typeof item.atomic !== 'boolean') out.push(finding('live.atomic', `${at}.atomic`));
    if (item.busy === true && item.messageChanged === true) out.push(finding('live.busy-update', at, 'review'));
    if (item.content !== undefined && !text(item.content, 3000)) out.push(finding('live.content', `${at}.content`));
  }
  return sorted(out);
}

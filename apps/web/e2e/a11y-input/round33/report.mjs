/** Produces safe structural CI artifacts; never emits private record text. */
import { finding, issueSummary, journeyIssues, object, sorted } from './contracts.mjs';
import { replayScan, auditFocusWalk, auditSwitchSelection, actionAudit, switchReport } from './switch.mjs';
import { auditAnnouncements, announcementReceipt, auditLiveSnapshot } from './announcements.mjs';
export const HEADERS = Object.freeze(['category', 'severity', 'code', 'path']);
export function inspection(journey, input = {}, options = {}) {
  if (!object(input) || !object(options)) throw new TypeError('invalid inspection options');
  const issues = [];
  issues.push(...journeyIssues(journey, { asOf: options.asOf }));
  if (input.actions !== undefined) issues.push(...actionAudit(input.actions));
  if (input.focus !== undefined) issues.push(...auditFocusWalk(journey, input.focus));
  if (input.announcements !== undefined) issues.push(...auditAnnouncements(input.announcements, options));
  if (input.live !== undefined) issues.push(...auditLiveSnapshot(input.live));
  const actionsValid = input.actions === undefined || actionAudit(input.actions).length === 0;
  const scan = input.actions === undefined || !actionsValid ? null : replayScan(journey, input.actions, options.scan ?? {});
  if (scan) issues.push(...auditSwitchSelection(journey, scan));
  const summary = issueSummary(issues);
  const uncertain = journey?.state === 'UNKNOWN' || journey?.evidence?.tier === 'UNKNOWN' || journey?.cache?.state === 'UNKNOWN';
  const decision = summary.error > 0 ? 'HOLD' : uncertain || scan?.phase === 'UNKNOWN' ? 'UNKNOWN' : 'READY';
  return { decision, issues: sorted(issues), summary, scan: scan ? switchReport(scan) : null,
    announcements: input.announcements ? announcementReceipt(input.announcements, options).totals : null };
}
export function diffInspections(before, after) {
  const a = new Set((before?.issues ?? []).map((i) => `${i.code}|${i.path}|${i.severity}`));
  const b = new Set((after?.issues ?? []).map((i) => `${i.code}|${i.path}|${i.severity}`));
  const introduced = [...b].filter((entry) => !a.has(entry)).sort();
  const resolved = [...a].filter((entry) => !b.has(entry)).sort();
  return { introduced, resolved, decisionChanged: before?.decision !== after?.decision,
    from: before?.decision ?? 'UNKNOWN', to: after?.decision ?? 'UNKNOWN' };
}
export function safeCell(value) {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const clean = [...raw].filter((ch) => {
    const n = ch.charCodeAt(0);
    return n > 31 && n !== 127 && !(n >= 128 && n <= 159);
  }).join('');
  return /^[\s]*[=+@-]/.test(clean) ? `'${clean}` : clean;
}
export function csvCell(value) { return `"${safeCell(value).replaceAll('"', '""')}"`; }
export function csvLine(cells) { return cells.map(csvCell).join(','); }
export function exportInspectionCsv(result) {
  const issues = Array.isArray(result?.issues) ? result.issues : [];
  const lines = [csvLine(HEADERS)];
  for (const issue of sorted(issues)) lines.push(csvLine([issue.code.split('.')[0], issue.severity, issue.code, issue.path]));
  return lines.join('\r\n') + '\r\n';
}
export function exportInspectionJson(result) {
  const clean = { decision: STATES.includes(result?.decision) ? result.decision : 'UNKNOWN',
    errors: result?.summary?.error ?? 0, reviews: result?.summary?.review ?? 0,
    issues: sorted(Array.isArray(result?.issues) ? result.issues : []).map(({ code, path, severity }) => ({ code, path, severity })),
    scan: result?.scan ? { phase: result.scan.phase, actions: result.scan.actions, selected: result.scan.selected } : null };
  return JSON.stringify(clean, null, 2) + '\n';
}
const STATES = ['READY', 'HOLD', 'UNKNOWN'];
export function exportInspectionJsonl(results) {
  if (!Array.isArray(results)) throw new TypeError('results must be array');
  return results.map((result) => JSON.stringify({ decision: STATES.includes(result?.decision) ? result.decision : 'UNKNOWN',
    errors: result?.summary?.error ?? 0, reviews: result?.summary?.review ?? 0,
    issueCodes: [...new Set((result?.issues ?? []).map((i) => i.code))].sort() })).join('\n') + (results.length ? '\n' : '');
}
export function releaseGate(inspections) {
  if (!Array.isArray(inspections) || inspections.length === 0) return { decision: 'UNKNOWN', reasons: ['inspection.missing'] };
  const hold = inspections.some((item) => item.decision === 'HOLD');
  const uncertain = inspections.some((item) => item.decision === 'UNKNOWN');
  return { decision: hold ? 'HOLD' : uncertain ? 'UNKNOWN' : 'READY', reasons: hold ? ['inspection.held'] : uncertain ? ['inspection.unknown'] : [] };
}
export function coverage(inspections) {
  const totals = { READY: 0, HOLD: 0, UNKNOWN: 0 };
  if (!Array.isArray(inspections)) return totals;
  for (const item of inspections) totals[STATES.includes(item?.decision) ? item.decision : 'UNKNOWN'] += 1;
  return totals;
}
export function regressionFindings(previous, next) {
  const diff = diffInspections(previous, next);
  const result = [];
  if (previous?.decision === 'READY' && next?.decision !== 'READY') result.push(finding('regression.readiness-lost', 'regression'));
  if (diff.introduced.length) result.push(finding('regression.issues-introduced', 'regression'));
  if ((next?.summary?.error ?? 0) > (previous?.summary?.error ?? 0)) result.push(finding('regression.errors-increased', 'regression'));
  return sorted(result);
}
export function reviewQueue(results) {
  if (!Array.isArray(results)) return [];
  return results.map((result, index) => ({ index, decision: STATES.includes(result?.decision) ? result.decision : 'UNKNOWN',
    issueCount: result?.issues?.length ?? 0 })).filter((item) => item.decision !== 'READY').sort((a, b) => a.index - b.index);
}
export function compareCoverage(before, after) {
  const a = coverage(before), b = coverage(after);
  return { readyDelta: b.READY - a.READY, holdDelta: b.HOLD - a.HOLD, unknownDelta: b.UNKNOWN - a.UNKNOWN };
}
export function sanitizeFilename(value) {
  if (typeof value !== 'string') return 'journey-report.json';
  const cleaned = value.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.length ? `${cleaned.slice(0, 80)}.json` : 'journey-report.json';
}
export function reportSummary(result) { return { decision: result?.decision ?? 'UNKNOWN', issues: result?.issues?.length ?? 0,
  errors: result?.summary?.error ?? 0, reviews: result?.summary?.review ?? 0 }; }

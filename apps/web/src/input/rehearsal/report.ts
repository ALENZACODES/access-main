import { type Assessment, type Finding, type Journey, type Locale, type Options, type Status, assessJourney, issue, ordinal, sortFindings, validId, validText } from './model.ts';
import { type Announcement, type KeyboardObservation, type ScanSnapshot, type ScanTarget, inspectAnnouncements, inspectKeyboard, inspectTargets, matchSelection, scanSummary } from './scanner.ts';

/** A local report describes a manual rehearsal, never conditions at a location. */
export interface Session {
  readonly journey: Journey;
  readonly locale: Locale;
  readonly targets: readonly ScanTarget[];
  readonly keyboard: readonly KeyboardObservation[];
  readonly announcements: readonly Announcement[];
  readonly scan: ScanSnapshot;
  readonly notes: string;
}
export interface Report {
  readonly status: Status;
  readonly sourceStatus: Status;
  readonly keyboardStatus: Status;
  readonly findings: readonly Finding[];
  readonly snapshot: ReturnType<typeof scanSummary>;
  readonly steps: Assessment['steps'];
  readonly locale: Locale;
  readonly name: string;
}
export interface Change { readonly action: 'ADD' | 'REPLACE' | 'RETAIN' | 'REVIEW' | 'RETIRE'; readonly id: string; readonly reasons: readonly string[] }
export const EXPORT_FIELDS = Object.freeze(['category','path','severity','code','status','locale']);
export function inspectSession(input: Session, options: Options): Report {
  const assessment = assessJourney(input.journey, options);
  const findings = [
    ...assessment.findings,
    ...inspectTargets(input.targets),
    ...inspectKeyboard(input.keyboard, input.targets),
    ...inspectAnnouncements(input.announcements, input.locale),
  ];
  if (input.scan.selected) findings.push(...matchSelection(input.scan.selected, input.targets, input.journey));
  findings.push(...input.scan.issues);
  if (input.notes.length > 2000) findings.push(issue('notes.length', 'notes', 'review'));
  const hasError = findings.some(f => f.severity === 'error');
  const keyboardStatus: Status = hasError ? 'HOLD' : input.keyboard.length === 0 ? 'UNKNOWN' : 'READY';
  const status: Status = hasError || assessment.status === 'HOLD' ? 'HOLD' :
    keyboardStatus === 'UNKNOWN' || assessment.status === 'UNKNOWN' ? 'UNKNOWN' : 'READY';
  return {
    status,
    sourceStatus: assessment.status,
    keyboardStatus,
    findings: sortFindings(findings),
    snapshot: scanSummary(input.scan, input.targets),
    steps: assessment.steps,
    locale: input.locale,
    name: input.journey.name[input.locale],
  };
}
export function comparison(before: Journey, after: Journey): Change[] {
  const old = new Map(before.steps.map(s => [s.id, s]));
  const now = new Map(after.steps.map(s => [s.id, s]));
  const ids = [...new Set([...old.keys(), ...now.keys()])].sort((a,b) => a.localeCompare(b, 'en'));
  return ids.map(id => {
    const a = old.get(id); const b = now.get(id);
    if (!a) return { action: 'ADD' as const, id, reasons: ['step.added'] };
    if (!b) return { action: 'RETIRE' as const, id, reasons: ['step.absent'] };
    const reasons: string[] = [];
    if (a.kind !== b.kind) reasons.push('step.kind');
    if (a.sequence !== b.sequence) reasons.push('step.order');
    if (a.access !== b.access) reasons.push('step.access');
    if (a.label.en !== b.label.en || a.label.fr !== b.label.fr) reasons.push('step.label');
    if (a.detail.en !== b.detail.en || a.detail.fr !== b.detail.fr) reasons.push('step.detail');
    if (a.source?.collectedOn !== b.source?.collectedOn || a.source?.url !== b.source?.url || a.source?.licence !== b.source?.licence || a.source?.tier !== b.source?.tier) reasons.push('source.changed');
    if (a.offline.state !== b.offline.state || a.offline.path !== b.offline.path || a.offline.savedOn !== b.offline.savedOn) reasons.push('offline.changed');
    if (a.needsReview !== b.needsReview) reasons.push('review.changed');
    if (!reasons.length) return { action: 'RETAIN' as const, id, reasons };
    if (a.access === 'unknown' || b.access === 'unknown') return { action: 'REVIEW' as const, id, reasons };
    return { action: 'REPLACE' as const, id, reasons };
  });
}
export function detectRegressions(before: Journey, after: Journey): Finding[] {
  const findings: Finding[] = [];
  const previous = new Map(before.steps.map(s => [s.id, s]));
  after.steps.forEach((step, i) => {
    const old = previous.get(step.id);
    if (!old) return;
    if (old.access === 'supported' && step.access !== 'supported') findings.push(issue('change.access-reduced', `steps[${i}].access`, 'review'));
    if (old.source?.collectedOn && step.source?.collectedOn && ordinal(step.source.collectedOn)! < ordinal(old.source.collectedOn)!) findings.push(issue('change.source-regressed', `steps[${i}].source`));
    if (old.offline.savedOn && step.offline.savedOn && ordinal(step.offline.savedOn)! < ordinal(old.offline.savedOn)!) findings.push(issue('change.cache-regressed', `steps[${i}].offline`));
    if (old.needsReview && !step.needsReview && step.source?.collectedOn === old.source?.collectedOn) findings.push(issue('change.review-cleared-without-source', `steps[${i}]`, 'review'));
  });
  return sortFindings(findings);
}
export function safeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).replaceAll('\r',' ').replaceAll('\n',' ').replaceAll('\t',' ').normalize('NFC');
  const clean = [...raw].filter(c => {
    const x = c.charCodeAt(0); return x > 31 && x !== 127 && (x < 128 || x > 159);
  }).join('').trim();
  return /^[=+@-]/.test(clean) ? "'" + clean : clean;
}
export function csvCell(value: unknown): string {
  return '"' + safeCell(value).replaceAll('"', '""') + '"';
}
export function csvLine(row: readonly unknown[]): string {
  return row.map(csvCell).join(',');
}
export function exportCsv(report: Report): string {
  const rows: unknown[][] = [EXPORT_FIELDS as string[]];
  for (const f of report.findings) rows.push(['rehearsal', f.path, f.severity, f.code, report.status, report.locale]);
  if (rows.length === 1) rows.push(['rehearsal', '', '', 'no-findings', report.status, report.locale]);
  return rows.map(csvLine).join('\r\n') + '\r\n';
}
export function safeJsonReport(report: Report): object {
  return {
    status: report.status,
    sourceStatus: report.sourceStatus,
    keyboardStatus: report.keyboardStatus,
    locale: report.locale,
    steps: report.steps.map(s => ({ id: s.id, status: s.status, reasons: s.reasons })),
    snapshot: report.snapshot,
    findings: report.findings.map(f => ({ ...f })),
  };
}
export function exportJson(report: Report): string { return JSON.stringify(safeJsonReport(report), null, 2); }
export function exportJsonLines(report: Report): string {
  const lines = report.findings.map(f => JSON.stringify({ category: 'rehearsal', ...f, status: report.status, locale: report.locale }));
  return lines.join('\n') + (lines.length ? '\n' : '');
}
export function exportHandoff(report: Report): { title: string; status: Status; checks: string[]; summary: Record<string, number> } {
  const summary: Record<string, number> = { error: 0, review: 0 };
  for (const f of report.findings) summary[f.severity] = (summary[f.severity] ?? 0) + 1;
  return {
    title: report.name,
    status: report.status,
    checks: [...new Set(report.findings.map(f => f.code))].sort(),
    summary,
  };
}
export function exportFilename(id: string, locale: Locale, format: 'csv' | 'json' | 'jsonl'): string {
  if (!validId(id)) throw new TypeError('Invalid file identifier');
  if (!['en','fr'].includes(locale)) throw new TypeError('Invalid language');
  if (!['csv','json','jsonl'].includes(format)) throw new TypeError('Invalid output format');
  return `access-rehearsal-${id}-${locale}.${format}`;
}
export function coverage(report: Report): { total: number; ready: number; hold: number; unknown: number; errors: number; reviews: number } {
  return {
    total: report.steps.length,
    ready: report.steps.filter(s => s.status === 'READY').length,
    hold: report.steps.filter(s => s.status === 'HOLD').length,
    unknown: report.steps.filter(s => s.status === 'UNKNOWN').length,
    errors: report.findings.filter(f => f.severity === 'error').length,
    reviews: report.findings.filter(f => f.severity === 'review').length,
  };
}
export function limitedSummary(report: Report): string {
  const counts = coverage(report);
  return `${report.status}: ${counts.total} steps; ${counts.unknown} UNKNOWN; ${counts.errors} errors; ${counts.reviews} review items`;
}
export function validateExportRequest(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const request = input as Record<string, unknown>;
  return validId(request.id) && ['en','fr'].includes(String(request.locale)) && ['csv','json','jsonl'].includes(String(request.format)) &&
    (request.name === undefined || validText(request.name, 200));
}
export function sanitizeReport(report: Report): Report {
  return { ...report, name: '', findings: report.findings.map(f => ({ ...f })), steps: report.steps.map(s => ({ ...s })) };
}

/** Human disposition ledger for document issues. No automatic closure. */
import { UNKNOWN, cleanText, dateValid, lexical, plain } from './document-outline-contract.mjs';
export const DECISIONS = Object.freeze(['UNKNOWN', 'needs-review', 'accepted', 'deferred']);
export function reviewKey(issue) { return [issue.doc, issue.code, String(issue.line), issue.detail].join('|'); }
export function checkDisposition(value, today = '2026-11-21') {
  const errors = [];
  if (!plain(value)) return ['DISPOSITION_OBJECT'];
  const expected = ['key', 'decision', 'reviewer', 'reviewedOn', 'note'];
  for (const key of expected) if (!Object.hasOwn(value, key)) errors.push(`DISPOSITION_MISSING_${key}`);
  for (const key of Object.keys(value)) if (!expected.includes(key)) errors.push(`DISPOSITION_EXTRA_${key}`);
  if (!cleanText(value.key, 400)) errors.push('DISPOSITION_KEY');
  if (!DECISIONS.includes(value.decision)) errors.push('DISPOSITION_DECISION');
  if (value.decision === 'accepted' || value.decision === 'deferred') {
    if (!cleanText(value.reviewer, 160)) errors.push('DISPOSITION_REVIEWER');
    if (!dateValid(value.reviewedOn) || value.reviewedOn > today) errors.push('DISPOSITION_DATE');
    if (!cleanText(value.note, 1000)) errors.push('DISPOSITION_NOTE');
  } else if (value.reviewer !== UNKNOWN || value.reviewedOn !== UNKNOWN || value.note !== UNKNOWN) errors.push('DISPOSITION_PENDING_METADATA');
  return errors;
}
export function validateLedger(value, today = '2026-11-21') {
  const errors = [];
  if (!plain(value) || value.schemaVersion !== 1 || !Array.isArray(value.decisions) || value.decisions.length > 5000)
    return { ok: false, errors: ['LEDGER_FIELDS'] };
  const keys = new Set();
  for (const row of value.decisions) {
    errors.push(...checkDisposition(row, today));
    if (typeof row?.key === 'string') {
      if (keys.has(row.key)) errors.push('LEDGER_DUPLICATE');
      keys.add(row.key);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value, errors: [] };
}
export function reconcileReview(report, ledger) {
  if (!report?.ok) return { ok: false, errors: ['REPORT_INVALID'] };
  const checked = validateLedger(ledger, report.value.today);
  if (!checked.ok) return checked;
  const index = new Map(ledger.decisions.map(row => [row.key, row]));
  const matched = new Set();
  const entries = report.value.issues.map(issue => {
    const key = reviewKey(issue), decision = index.get(key);
    if (decision) matched.add(key);
    return { ...issue, key, disposition: decision?.decision ?? UNKNOWN,
      reviewer: decision?.reviewer ?? UNKNOWN, reviewedOn: decision?.reviewedOn ?? UNKNOWN,
      note: decision?.note ?? UNKNOWN };
  });
  const stale = ledger.decisions.filter(item => !matched.has(item.key)).map(item => item.key).sort(lexical);
  const outstanding = entries.filter(e => e.disposition === UNKNOWN || e.disposition === 'needs-review');
  const deferred = entries.filter(e => e.disposition === 'deferred');
  return { ok: true, value: { entries, stale, outstanding, deferred, accepted: entries.filter(e => e.disposition === 'accepted'),
    caution: 'A human acceptance does not establish accessibility conformance.' } };
}
export function makePendingLedger(report) {
  if (!report?.ok) return { ok: false, errors: ['REPORT_INVALID'] };
  return { ok: true, value: { schemaVersion: 1, decisions: report.value.issues.map(issue => ({ key: reviewKey(issue),
    decision: UNKNOWN, reviewer: UNKNOWN, reviewedOn: UNKNOWN, note: UNKNOWN })) } };
}
export function planHumanReview(report, reconciled = null) {
  if (!report?.ok) return [];
  const outstanding = reconciled?.ok ? reconciled.value.outstanding : report.value.issues;
  return outstanding.map(item => ({ id: item.doc, key: item.key ?? reviewKey(item),
    severity: item.severity, action: item.severity === 'block' ? 'Resolve or document blocking issue' : 'Review source and record disposition',
    note: UNKNOWN })).sort((a,b) => (a.severity === 'block' ? -1 : 0) - (b.severity === 'block' ? -1 : 0) || lexical(a.key,b.key));
}

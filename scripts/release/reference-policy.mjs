/** Offline review decisions for findings; a decision is not evidence of link availability. */
import { validDate, textField, plain } from './reference-contract.mjs';
export const DECISIONS = Object.freeze(['acknowledged', 'needs-source', 'deferred']);
const RECORD_FIELDS = new Set(['id', 'code', 'decision', 'reviewer', 'decidedOn', 'reason']);
const ROOT_FIELDS = new Set(['schemaVersion', 'reviewedOn', 'decisions']);
const KEY = /^[a-z]{2}:[a-zA-Z][a-zA-Z0-9._:-]{0,79}$/u;
const CODE = /^[A-Z][A-Z0-9_]{1,99}$/u;
function issue(path, code) { return `${path}:${code}`; }
export function checkDecisionSet(value, report, { today = '2026-11-21' } = {}) {
  const problems = [];
  if (!validDate(today)) return { ok: false, problems: ['today:DATE'] };
  if (!plain(value)) return { ok: false, problems: ['root:OBJECT'] };
  for (const key of Object.keys(value)) if (!ROOT_FIELDS.has(key)) problems.push(issue(`root.${key}`, 'EXTRA_FIELD'));
  if (value.schemaVersion !== 1) problems.push('schemaVersion:VERSION');
  if (!validDate(value.reviewedOn) || value.reviewedOn > today) problems.push('reviewedOn:DATE');
  if (!Array.isArray(value.decisions) || value.decisions.length > 800) problems.push('decisions:ARRAY');
  else {
    const seen = new Set();
    const findings = new Set(report?.findings?.map(finding => `${finding.id}|${finding.code}`) ?? []);
    for (const [index, decision] of value.decisions.entries()) {
      const path = `decisions[${index}]`;
      if (!plain(decision)) { problems.push(issue(path, 'OBJECT')); continue; }
      for (const key of Object.keys(decision)) if (!RECORD_FIELDS.has(key)) problems.push(issue(`${path}.${key}`, 'EXTRA_FIELD'));
      if (!KEY.test(decision.id ?? '')) problems.push(issue(`${path}.id`, 'IDENTIFIER'));
      if (!CODE.test(decision.code ?? '')) problems.push(issue(`${path}.code`, 'CODE'));
      if (!DECISIONS.includes(decision.decision)) problems.push(issue(`${path}.decision`, 'DECISION'));
      if (!textField(decision.reviewer, 120)) problems.push(issue(`${path}.reviewer`, 'REVIEWER'));
      if (!textField(decision.reason, 1000)) problems.push(issue(`${path}.reason`, 'REASON'));
      if (!validDate(decision.decidedOn) || decision.decidedOn > today || decision.decidedOn > value.reviewedOn) problems.push(issue(`${path}.decidedOn`, 'DATE'));
      const key = `${decision.id}|${decision.code}`;
      if (seen.has(key)) problems.push(issue(path, 'DUPLICATE'));
      seen.add(key);
      if (report && !findings.has(key)) problems.push(issue(path, 'NO_MATCHING_FINDING'));
    }
  }
  return { ok: problems.length === 0, problems };
}
export function reconcileDecisions(report, decisions, { today = '2026-11-21' } = {}) {
  const valid = checkDecisionSet(decisions, report, { today });
  if (!valid.ok) return valid;
  const applied = new Map(decisions.decisions.map(row => [`${row.id}|${row.code}`, row]));
  const findings = report.findings.map(finding => {
    const decision = applied.get(`${finding.id}|${finding.code}`) ?? null;
    return { ...finding, decision: decision?.decision ?? 'unreviewed', decidedOn: decision?.decidedOn ?? null, reviewer: decision?.reviewer ?? null };
  });
  const summary = { total: findings.length, unreviewed: 0, acknowledged: 0, 'needs-source': 0, deferred: 0 };
  for (const finding of findings) summary[finding.decision]++;
  return { ok: true, value: { reviewedOn: decisions.reviewedOn, summary, findings } };
}
export function requiredNextActions(reconciliation) {
  if (!reconciliation || !Array.isArray(reconciliation.findings)) return [];
  return reconciliation.findings.filter(finding => finding.decision !== 'acknowledged').map(finding => ({ id: finding.id, code: finding.code, next: finding.decision === 'unreviewed' ? 'review' : finding.decision === 'needs-source' ? 'collect-source' : 'follow-up' }));
}
export function emptyDecisionSet(reviewedOn) {
  if (!validDate(reviewedOn)) throw Error('DATE');
  return { schemaVersion: 1, reviewedOn, decisions: [] };
}

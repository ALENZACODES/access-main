import { analyzeLedger } from './review-ledger-engine.mjs';
import { error, validateLedger } from './review-ledger-contract.mjs';
const OBS_FIELDS = Object.freeze(['placeId', 'feature', 'status', 'source', 'licence', 'retrievedOn', 'verificationTier', 'summary', 'documentHash', 'note']);
const CASE_FIELDS = Object.freeze(['placeId', 'feature', 'createdOn', 'observationIds']);
const EVENT_FIELDS = Object.freeze(['caseId', 'action', 'date', 'reason', 'source', 'licence', 'retrievedOn', 'verificationTier', 'reference', 'decision']);
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function fieldsChanged(a, b, keys) {
  return keys.filter(key => !same(a[key] ?? null, b[key] ?? null));
}
function compareRows(before, after, keys) {
  const left = new Map(before.map(row => [row.id, row]));
  const right = new Map(after.map(row => [row.id, row]));
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  const changes = [];
  for (const id of ids) {
    const previous = left.get(id);
    const current = right.get(id);
    const changedFields = previous && current ? fieldsChanged(previous, current, keys) : [];
    const kind = !previous ? 'added' : !current ? 'removed' : changedFields.length ? 'changed' : 'unchanged';
    counts[kind] += 1;
    changes.push({ id, kind, fields: changedFields, before: previous ?? null, after: current ?? null });
  }
  return { counts, changes };
}
export function compareLedgers(before, after, { today = '2026-11-20' } = {}) {
  const a = validateLedger(before, { today });
  const b = validateLedger(after, { today });
  if (!a.ok || !b.ok) return { ok: false, issues: [...a.issues.map(x => ({ ...x, path: `before.${x.path}` })), ...b.issues.map(x => ({ ...x, path: `after.${x.path}` }))] };
  const observations = compareRows(before.observations, after.observations, OBS_FIELDS);
  const cases = compareRows(before.cases, after.cases, CASE_FIELDS);
  const events = compareRows(before.events, after.events, EVENT_FIELDS);
  const oldAnalysis = analyzeLedger(before, { today });
  const newAnalysis = analyzeLedger(after, { today });
  if (!oldAnalysis.ok || !newAnalysis.ok) return { ok: false, issues: [...oldAnalysis.issues, ...newAnalysis.issues] };
  const states = compareRows(oldAnalysis.cases.map(x => ({ id: x.id, state: x.workflow.state, decision: x.workflow.decision, status: x.statuses.status, hasConflict: x.statuses.hasConflict })), newAnalysis.cases.map(x => ({ id: x.id, state: x.workflow.state, decision: x.workflow.decision, status: x.statuses.status, hasConflict: x.statuses.hasConflict })), ['state', 'decision', 'status', 'hasConflict']);
  const nonAppendEvents = events.changes.filter(x => x.kind === 'changed' || x.kind === 'removed');
  const nonAppendEvidence = observations.changes.filter(x => x.kind === 'changed' || x.kind === 'removed');
  const conclusions = [];
  if (nonAppendEvents.length) conclusions.push({ code: 'EVENT_HISTORY_CHANGED', count: nonAppendEvents.length });
  if (nonAppendEvidence.length) conclusions.push({ code: 'EVIDENCE_REPLACED_OR_REMOVED', count: nonAppendEvidence.length });
  if (states.changes.some(x => x.kind === 'changed')) conclusions.push({ code: 'CASE_STATE_CHANGED', count: states.counts.changed });
  const newConflicts = states.changes.filter(x => x.after?.hasConflict && !x.before?.hasConflict);
  if (newConflicts.length) conclusions.push({ code: 'NEW_CONFLICT', count: newConflicts.length });
  return { ok: true, observations, cases, events, states, conclusions, appendOnly: nonAppendEvents.length === 0 && nonAppendEvidence.length === 0 && cases.counts.removed === 0 && cases.counts.changed === 0 };
}
export function evidenceReconciliation(ledger, { today = '2026-11-20' } = {}) {
  const analysis = analyzeLedger(ledger, { today });
  if (!analysis.ok) return analysis;
  const findings = [];
  for (const item of analysis.cases) {
    if (item.statuses.status === 'UNKNOWN') findings.push({ id: item.id, code: 'UNKNOWN_STATUS', severity: 'review', detail: 'No unambiguous reported status' });
    if (item.statuses.hasConflict) findings.push({ id: item.id, code: 'CONFLICT', severity: 'review', detail: 'Contradictory reported statuses' });
    if (item.workflow.state === 'new') findings.push({ id: item.id, code: 'UNOPENED_CASE', severity: 'review', detail: 'No open event' });
    if (item.workflow.state === 'waiting') findings.push({ id: item.id, code: 'AWAITING_EVIDENCE', severity: 'info', detail: 'Requested evidence has not been supplied in this case' });
    if (item.workflow.state === 'deferred') findings.push({ id: item.id, code: 'DEFERRED', severity: 'info', detail: 'Human review deferred' });
    if (item.workflow.state === 'closed' && item.workflow.decision === 'reviewed' && item.statuses.hasConflict) findings.push({ id: item.id, code: 'REVIEWED_WITH_CONFLICT', severity: 'review', detail: 'Review conclusion did not remove conflicting reports' });
    for (const record of item.evidence) {
      const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${record.retrievedOn}T00:00:00Z`)) / 86400000);
      if (days > 365) findings.push({ id: item.id, observationId: record.id, code: 'OLD_EVIDENCE', severity: 'review', detail: `Evidence is ${days} days old` });
      if (record.verificationTier === 'unknown') findings.push({ id: item.id, observationId: record.id, code: 'UNKNOWN_TIER', severity: 'info', detail: 'Evidence tier is UNKNOWN' });
      if (record.documentHash === null) findings.push({ id: item.id, observationId: record.id, code: 'NO_DOCUMENT_HASH', severity: 'info', detail: 'No file hash supplied' });
    }
  }
  const counts = { total: findings.length, review: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return { ok: true, counts, findings: findings.sort((a, b) => a.id.localeCompare(b.id) || a.code.localeCompare(b.code) || (a.observationId ?? '').localeCompare(b.observationId ?? '')) };
}
export function compareFindingSets(before, after, options = {}) {
  const a = evidenceReconciliation(before, options);
  const b = evidenceReconciliation(after, options);
  if (!a.ok || !b.ok) return { ok: false, issues: [...(a.issues ?? []), ...(b.issues ?? [])] };
  const key = x => `${x.id}|${x.observationId ?? ''}|${x.code}`;
  const old = new Map(a.findings.map(x => [key(x), x]));
  const now = new Map(b.findings.map(x => [key(x), x]));
  return {
    ok: true,
    newFindings: [...now].filter(([id]) => !old.has(id)).map(([, v]) => v),
    resolvedFindings: [...old].filter(([id]) => !now.has(id)).map(([, v]) => v),
    retainedFindings: [...now].filter(([id]) => old.has(id)).map(([, v]) => v)
  };
}
export function casesWithFeature(analysis, feature) {
  if (!analysis?.ok) return [];
  return analysis.cases.filter(row => row.feature === feature);
}
export function caseStateChanges(before, after, options = {}) {
  const compared = compareLedgers(before, after, options);
  if (!compared.ok) return compared;
  return { ok: true, changes: compared.states.changes.filter(x => x.kind !== 'unchanged') };
}
export function requireAppendOnly(before, after, options = {}) {
  const diff = compareLedgers(before, after, options);
  if (!diff.ok) return diff;
  return diff.appendOnly ? { ok: true, issues: [] } : { ok: false, issues: [error('HISTORY_NOT_APPEND_ONLY', '$')] };
}
